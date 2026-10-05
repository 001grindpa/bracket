# Bracket

Bracket holds a tournament prize until two public pages name the same winner, and that handle is registered.

## Deployment

- **Network:** GenLayer StudioNet
- **Chain ID:** 61999 (`0xf22f`)
- **Contract:** `0xf4ee36758f123755558f80bdB607041b961E21Bc`
- **Explorer:** [View contract](https://explorer-studio.genlayer.com/address/0xf4ee36758f123755558f80bdB607041b961E21Bc)

**Source:** [`src/Bracket.py`](src/Bracket.py)

## How it works

1. An organizer posts a prize with a title, game, bracket date, roster URL, and bracket URL.
2. Players register a handle before the bracket date.
3. On or after the bracket date, anyone can settle the tournament.
4. The prize is paid only if both pages name the same handle and that handle is registered.
5. An unregistered winner does not move the prize. If the tournament is still open the next UTC day, anyone can return the prize to the organizer.

## Methods

- `create_tournament(title, game, bracket_date, roster_url, bracket_url)` payable. Returns the id.
- `register(tournament_id, handle)` before the bracket date.
- `settle(tournament_id)` on or after `bracket_date`.
- `return_unclaimed(tournament_id)` on or after `claim_after`.
- `get_tournament(tournament_id)`
- `get_entry(tournament_id, handle)`
- `get_tournament_count()`
- `get_reserved_prizes()`

`claim_after` is stored as the bracket date plus one UTC day. It is not an argument.

## Rules

- The prize must be greater than zero.
- `bracket_date` must be a real `YYYY-MM-DD` date.
- The roster URL and the bracket URL must be HTTPS, allowlisted, and on different hosts.
- A handle is 3 to 24 letters, numbers, dot, underscore, or dash.

### Outcomes

- `UNKNOWN` and `DISAGREE` leave the tournament `OPEN`.
- `PAID` means the prize went to the registered winner.
- `RETURNED` means the unclaimed prize went back to the organizer.

## Tests

Direct tests: [`test/direct/test_bracket.py`](test/direct/test_bracket.py).

They cover distinct sources, impossible dates, registration, duplicate handles, early settlement and return, return blocked on the bracket day, return after `claim_after`, unregistered winners, and payment to a registered winner.
