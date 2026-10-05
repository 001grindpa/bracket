CONTRACT = "src/Bracket.py"
ROSTER = "https://liquipedia.net/rocketleague/Main_Page"
BRACKET = "https://www.start.gg/"


def _create(contract, vm, organizer, bracket_date="2026-12-31"):
    vm.sender = organizer
    return contract.create_tournament(
        "City Cup",
        "Rocket League",
        bracket_date,
        ROSTER,
        BRACKET,
        value=10**18,
    )


def test_sources_must_differ(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("roster and bracket must come from two different hosts"):
        contract.create_tournament(
            "City Cup",
            "Rocket League",
            "2026-12-31",
            ROSTER,
            "https://liquipedia.net/rocketleague/Roster",
            value=10**18,
        )


def test_rejects_impossible_date(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("bracket_date must be a real calendar date"):
        contract.create_tournament(
            "City Cup",
            "Rocket League",
            "2026-02-31",
            ROSTER,
            BRACKET,
            value=10**18,
        )


def test_register_and_reject_duplicate(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.register(tournament_id, "Ace_One")
    raw = contract.get_entry(tournament_id, "ace_one")
    assert "ace_one" in raw
    with direct_vm.expect_revert("handle already registered"):
        contract.register(tournament_id, "ACE_ONE")


def test_early_settle_and_return_blocked(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice)
    raw = contract.get_tournament(tournament_id)
    assert "OPEN" in raw
    assert "2027-01-01" in raw
    with direct_vm.expect_revert("bracket cannot be settled before"):
        contract.settle(tournament_id)
    with direct_vm.expect_revert("unclaimed prize cannot return before"):
        contract.return_unclaimed(tournament_id)
    assert "OPEN" in contract.get_tournament(tournament_id)


def test_return_not_open_on_bracket_day(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice, bracket_date="2026-10-05")
    raw = contract.get_tournament(tournament_id)
    assert "2026-10-05" in raw
    assert "2026-10-06" in raw
    with direct_vm.expect_revert("unclaimed prize cannot return before"):
        contract.return_unclaimed(tournament_id)
    assert "OPEN" in contract.get_tournament(tournament_id)


def test_return_unclaimed_once(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice, bracket_date="2020-01-01")
    assert "2020-01-02" in contract.get_tournament(tournament_id)
    contract.return_unclaimed(tournament_id)
    after = contract.get_tournament(tournament_id)
    assert "RETURNED" in after
    assert "RETURNED_TO_ORGANIZER" in after
    assert contract.get_reserved_prizes() == "0"
    with direct_vm.expect_revert("prize is not returnable"):
        contract.return_unclaimed(tournament_id)


def test_unregistered_winner_does_not_pay(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice, bracket_date="2020-01-01")

    def winner(_item):
        return {"verdict": "WINNER", "handle": "ghost"}

    contract._adjudicate = winner
    status = contract.settle(tournament_id)
    after = contract.get_tournament(tournament_id)
    assert "OPEN" in after
    assert "ghost" in after
    assert "UNREGISTERED_WINNER" in after
    assert "PAID" not in str(status)
    assert contract.get_reserved_prizes() == str(10**18)


def test_registered_winner_is_paid(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    tournament_id = _create(contract, direct_vm, direct_alice, bracket_date="2020-01-01")
    direct_vm.sender = direct_bob
    contract.register(tournament_id, "ace")

    def winner(_item):
        return {"verdict": "WINNER", "handle": "ace"}

    contract._adjudicate = winner
    contract.settle(tournament_id)
    after = contract.get_tournament(tournament_id)
    assert "PAID" in after
    assert "PAID_TO_REGISTERED_WINNER" in after
    assert "ace" in after
    assert contract.get_reserved_prizes() == "0"
    with direct_vm.expect_revert("tournament is not open"):
        contract.settle(tournament_id)