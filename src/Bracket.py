# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from genlayer import *


HTTPS = "https://"
MAX_PAGE_CHARS = 12000
MIN_TEXT_CHARS = 3
CLAIM_GRACE_DAYS = 1
ZERO = Address("0x0000000000000000000000000000000000000000")
HANDLE_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")

ALLOWED_HOSTS = (
    "liquipedia.net",
    "www.liquipedia.net",
    "challengermode.com",
    "www.challengermode.com",
    "toornament.com",
    "www.toornament.com",
    "start.gg",
    "www.start.gg",
    "battlefy.com",
    "www.battlefy.com",
    "github.com",
    "www.github.com",
    "gitlab.com",
    "www.gitlab.com",
    "docs.google.com",
    "wikipedia.org",
    "en.wikipedia.org",
)


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _host_allowed(url: str) -> bool:
    host = _host(url)
    if not host:
        return False
    for allowed in ALLOWED_HOSTS:
        base = allowed[4:] if allowed.startswith("www.") else allowed
        if host == allowed or host == base or host.endswith("." + base):
            return True
    return False


def _require_https_url(url: str, label: str) -> str:
    cleaned = url.strip()
    if not cleaned.lower().startswith(HTTPS):
        raise gl.vm.UserError(f"{label} must be an https url")
    if not _host_allowed(cleaned):
        raise gl.vm.UserError(f"{label} host is not on the source allowlist")
    return cleaned


def _require_date(value: str, label: str) -> str:
    cleaned = value.strip()
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        raise gl.vm.UserError(label + " must be a real calendar date YYYY-MM-DD")
    return cleaned


def _add_days(day: str, days: int) -> str:
    return (datetime.strptime(day, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _norm_handle(value: str) -> str:
    return re.sub(r"\s+", "", value or "").lower()


@gl.evm.contract_interface
class _Wallet:
    class View:
        pass

    class Write:
        pass


def _pay(to: Address, amount: u256) -> None:
    if amount == 0:
        return
    if to == ZERO:
        raise gl.vm.UserError("cannot pay the zero address")
    _Wallet(to).emit_transfer(value=amount)


@allow_storage
@dataclass
class Tournament:
    organizer: Address
    title: str
    game: str
    bracket_date: str
    claim_after: str
    roster_url: str
    bracket_url: str
    prize: u256
    status: str
    winner_handle: str
    winner: Address
    funds_disposition: str


@allow_storage
@dataclass
class Entry:
    player: Address
    handle: str


class Bracket(gl.Contract):
    tournaments: TreeMap[str, Tournament]
    entries: TreeMap[str, Entry]
    next_id: u256
    reserved_prizes: u256

    def __init__(self):
        self.next_id = u256(1)
        self.reserved_prizes = u256(0)

    def _id(self) -> str:
        return str(int(self.next_id))

    def _entry_key(self, tournament_id: str, handle: str) -> str:
        return tournament_id + ":" + handle

    def _get(self, tournament_id: str) -> Tournament:
        if tournament_id not in self.tournaments:
            raise gl.vm.UserError("tournament not found")
        return self.tournaments[tournament_id]

    def _extract_winner(self, url: str, title: str, game: str, bracket_date: str) -> dict:
        failed = {"related": False, "date_match": False, "handle": ""}
        try:
            raw = gl.nondet.web.render(url, mode="text")
            page_text = raw if isinstance(raw, str) else str(raw)
            page_text = page_text[:MAX_PAGE_CHARS]
        except Exception:
            return failed
        prompt = f"""
Read one public tournament page and extract the winner handle.

Tournament: {title}
Game: {game}
Bracket date (YYYY-MM-DD): {bracket_date}
Source URL: {url}

Page text:
{page_text}

Return JSON only:
{{
  "related": true or false,
  "date_match": true or false,
  "handle": "winner handle or empty"
}}
Rules:
- related is true only if the page is this tournament.
- date_match is true only if the page is about that calendar day or a final on that day.
- handle is the winner's public handle, with no spaces. Empty if the winner is not shown.
"""
        try:
            parsed = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
        except Exception:
            return failed
        handle = _norm_handle(str(parsed.get("handle", "")))
        if not HANDLE_RE.match(handle):
            handle = ""
        return {
            "related": bool(parsed.get("related", False)),
            "date_match": bool(parsed.get("date_match", False)),
            "handle": handle,
        }

    def _decision(self, item: Tournament) -> dict:
        try:
            roster = self._extract_winner(item.roster_url, item.title, item.game, item.bracket_date)
            bracket = self._extract_winner(item.bracket_url, item.title, item.game, item.bracket_date)
        except Exception:
            return {"verdict": "UNKNOWN", "handle": ""}
        if (
            not roster["related"]
            or not bracket["related"]
            or not roster["date_match"]
            or not bracket["date_match"]
            or roster["handle"] == ""
            or bracket["handle"] == ""
        ):
            return {"verdict": "UNKNOWN", "handle": ""}
        if roster["handle"] != bracket["handle"]:
            return {"verdict": "DISAGREE", "handle": ""}
        return {"verdict": "WINNER", "handle": roster["handle"]}

    def _adjudicate(self, item: Tournament) -> dict:
        def leader_fn() -> str:
            return json.dumps(self._decision(item), sort_keys=True, separators=(",", ":"))

        def validator_fn(leader_result) -> bool:
            payload = leader_result
            if hasattr(leader_result, "calldata"):
                payload = leader_result.calldata
            if isinstance(payload, (bytes, bytearray)):
                payload = payload.decode("utf-8", errors="replace")
            if not isinstance(payload, str):
                payload = str(payload)
            try:
                leader = json.loads(payload)
            except Exception:
                return False
            own = self._decision(item)
            return (
                own.get("verdict") == str(leader.get("verdict", "")).upper()
                and own.get("handle") == _norm_handle(str(leader.get("handle", "")))
            )

        try:
            raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        except Exception:
            return {"verdict": "UNKNOWN", "handle": ""}
        try:
            if isinstance(raw, str):
                return json.loads(raw)
            if hasattr(raw, "calldata"):
                data = raw.calldata
                return json.loads(data if isinstance(data, str) else str(data))
            return json.loads(str(raw))
        except Exception:
            return {"verdict": "UNKNOWN", "handle": ""}

    @gl.public.write.payable
    def create_tournament(
        self,
        title: str,
        game: str,
        bracket_date: str,
        roster_url: str,
        bracket_url: str,
    ) -> str:
        if len(title.strip()) < MIN_TEXT_CHARS or len(game.strip()) < MIN_TEXT_CHARS:
            raise gl.vm.UserError("title and game are required")
        bracket_date = _require_date(bracket_date, "bracket_date")
        roster = _require_https_url(roster_url, "roster_url")
        bracket = _require_https_url(bracket_url, "bracket_url")
        if _host(roster) == _host(bracket):
            raise gl.vm.UserError("roster and bracket must come from two different hosts")
        prize = gl.message.value
        if prize == u256(0):
            raise gl.vm.UserError("prize must be greater than zero")
        tournament_id = self._id()
        self.tournaments[tournament_id] = Tournament(
            organizer=gl.message.sender_address,
            title=title.strip(),
            game=game.strip(),
            bracket_date=bracket_date,
            claim_after=_add_days(bracket_date, CLAIM_GRACE_DAYS),
            roster_url=roster,
            bracket_url=bracket,
            prize=prize,
            status="OPEN",
            winner_handle="",
            winner=ZERO,
            funds_disposition="RESERVED",
        )
        self.next_id = self.next_id + u256(1)
        self.reserved_prizes = self.reserved_prizes + prize
        return tournament_id

    @gl.public.write
    def register(self, tournament_id: str, handle: str) -> None:
        item = self._get(tournament_id)
        if item.status != "OPEN":
            raise gl.vm.UserError("registration is closed")
        if _today_utc() > item.bracket_date:
            raise gl.vm.UserError("registration is closed")
        cleaned = _norm_handle(handle)
        if HANDLE_RE.match(cleaned) is None:
            raise gl.vm.UserError("handle must be 3 to 24 letters, numbers, dot, underscore, or dash")
        key = self._entry_key(tournament_id, cleaned)
        if key in self.entries:
            raise gl.vm.UserError("handle already registered")
        self.entries[key] = Entry(player=gl.message.sender_address, handle=cleaned)

    @gl.public.write
    def settle(self, tournament_id: str) -> str:
        item = self._get(tournament_id)
        if item.status != "OPEN":
            raise gl.vm.UserError("tournament is not open")
        if _today_utc() < item.bracket_date:
            raise gl.vm.UserError("bracket cannot be settled before " + item.bracket_date)
        result = self._adjudicate(item)
        verdict = str(result.get("verdict", "UNKNOWN")).upper()
        handle = _norm_handle(str(result.get("handle", "")))
        if verdict != "WINNER" or handle == "":
            item.winner_handle = verdict if verdict in ("UNKNOWN", "DISAGREE") else "UNKNOWN"
            self.tournaments[tournament_id] = item
            return item.status
        key = self._entry_key(tournament_id, handle)
        if key not in self.entries:
            item.winner_handle = handle
            item.funds_disposition = "UNREGISTERED_WINNER"
            self.tournaments[tournament_id] = item
            return item.status
        entry = self.entries[key]
        item.status = "PAID"
        item.winner_handle = handle
        item.winner = entry.player
        item.funds_disposition = "PAID_TO_REGISTERED_WINNER"
        self.reserved_prizes = self.reserved_prizes - item.prize
        self.tournaments[tournament_id] = item
        _pay(entry.player, item.prize)
        return item.status

    @gl.public.write
    def return_unclaimed(self, tournament_id: str) -> None:
        item = self._get(tournament_id)
        if item.status != "OPEN":
            raise gl.vm.UserError("prize is not returnable")
        if _today_utc() < item.claim_after:
            raise gl.vm.UserError("unclaimed prize cannot return before " + item.claim_after)
        prize = item.prize
        organizer = item.organizer
        item.status = "RETURNED"
        item.funds_disposition = "RETURNED_TO_ORGANIZER"
        self.reserved_prizes = self.reserved_prizes - prize
        self.tournaments[tournament_id] = item
        _pay(organizer, prize)

    @gl.public.view
    def get_tournament(self, tournament_id: str) -> str:
        item = self._get(tournament_id)
        return json.dumps(
            {
                "organizer": item.organizer.as_hex,
                "title": item.title,
                "game": item.game,
                "bracket_date": item.bracket_date,
                "claim_after": item.claim_after,
                "roster_url": item.roster_url,
                "bracket_url": item.bracket_url,
                "prize": str(int(item.prize)),
                "status": item.status,
                "winner_handle": item.winner_handle,
                "winner": item.winner.as_hex,
                "funds_disposition": item.funds_disposition,
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_entry(self, tournament_id: str, handle: str) -> str:
        key = self._entry_key(tournament_id, _norm_handle(handle))
        if key not in self.entries:
            raise gl.vm.UserError("entry not found")
        entry = self.entries[key]
        return json.dumps(
            {"player": entry.player.as_hex, "handle": entry.handle},
            sort_keys=True,
        )

    @gl.public.view
    def get_tournament_count(self) -> str:
        return str(int(self.next_id) - 1)

    @gl.public.view
    def get_reserved_prizes(self) -> str:
        return str(int(self.reserved_prizes))