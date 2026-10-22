# Bracket

Bracket is a decentralized tournament prize escrow contract deployed on GenLayer StudioNet. The contract locks tournament prize funds until two independent public sources unanimously name the same winner, and that player handle is registered.

## Deployment

- **Network:** GenLayer StudioNet
- **Chain ID:** 61999 (0xf22f)
- **Contract Address:** `0x3D6368539B1959A74229326853dfD783aC11A55D`
- **Explorer:** [https://explorer-studio.genlayer.com/address/0x3D6368539B1959A74229326853dfD783aC11A55D](https://explorer-studio.genlayer.com/address/0x3D6368539B1959A74229326853dfD783aC11A55D)
- **Source Code:** [src/Bracket.py](src/Bracket.py)

The submitted source code in `src/Bracket.py` matches the deployed contract on StudioNet.

## How It Works

1. **Tournament Creation and Escrow:** An organizer posts a tournament by depositing a prize in GEN along with title, game, bracket date, roster URL, and bracket URL. The funds remain locked in contract storage.
2. **Handle Authorization:** The organizer authorizes competitive handles to specific player wallet addresses via `authorize`.
3. **Player Registration:** The designated player claims and registers the authorized handle with their own wallet via `register`.
4. **Registration Rule:** Registration closes the day before the declared `bracket_date`. Neither authorization nor registration is permitted on or after the bracket date.
5. **Settlement Consensus:** On or after the `bracket_date`, any participant can call `settle`. GenLayer AI validators query both the roster URL and bracket URL. The prize is paid out if and only if both public pages unanimously confirm the same registered winner handle.
6. **Unclaimed Prize Return:** If the tournament remains open without a registered payout, anyone can call `return_unclaimed` on or after `claim_after` (one day after `bracket_date`) to release the funds back to the organizer.

## Methods

### Write Methods

- `create_tournament(title: str, game: str, bracket_date: str, roster_url: str, bracket_url: str) -> str`: Payable method to deposit prize funds and instantiate a new tournament.
- `authorize(tournament_id: str, handle: str, player: str) -> None`: Organizer only. Binds a competitive handle to a player wallet address. Closes before the bracket date.
- `register(tournament_id: str, handle: str) -> None`: Authorized player only. Registers the seat into an active entry. Closes before the bracket date.
- `settle(tournament_id: str) -> str`: Settle the tournament on or after `bracket_date`. Evaluates consensus across both web sources.
- `return_unclaimed(tournament_id: str) -> None`: Returns escrowed prize to the organizer on or after `claim_after`.

### View Methods

- `get_tournament(tournament_id: str) -> str`: Returns tournament details in JSON format (organizer, title, game, bracket_date, claim_after, roster_url, bracket_url, prize, status, winner_handle, winner, funds_disposition).
- `get_seat(tournament_id: str, handle: str) -> str`: Returns authorized seat details in JSON format (player address, handle).
- `get_entry(tournament_id: str, handle: str) -> str`: Returns registered entry details in JSON format (player address, handle).
- `get_tournament_count() -> str`: Returns total count of instantiated tournaments.
- `get_reserved_prizes() -> str`: Returns total value of currently reserved prize funds in wei.

## Validation and Rules

- The prize amount must be greater than zero.
- `bracket_date` must be a valid calendar date in `YYYY-MM-DD` format.
- `roster_url` and `bracket_url` must be HTTPS, belong to allowlisted sources, and originate from two distinct hosts.
- Player handles must contain 3 to 24 characters: letters, numbers, dot, underscore, or dash.
- Outcomes:
  - `OPEN`: Tournament is active and pending settlement or reclamation.
  - `PAID`: Dual sources confirmed the registered winner; funds disbursed to the winner.
  - `RETURNED`: Unclaimed prize returned to organizer after the grace period.

## Frontend Application

The frontend is a static single-page web application featuring:
- A public landing view with tournament overview, specimen bracket visualization, and contract details (without a wallet button).
- An interactive working desk view with panels for Create, Authorize, Register, Settle, Return, and Lookup.
- Circular theme toggle for light and dark modes with localStorage persistence.
- EIP-6963 and injected provider wallet connectivity on the desk.
- Real-time 7-phase write flow tracker: `signature` -> `submitted` -> `wait finalized` -> `consensus` -> `execution` -> `read` -> `accepted`.
- Post-write readout that queries contract state and updates the tournament dossier.
- Safe read calls using neutral callers with no undefined `from` properties.

## Testing

To run the frontend test suite:

```bash
node --test test/frontend/app.test.js
```

Direct contract test suite:

```bash
pytest test/direct/test_bracket.py
```
