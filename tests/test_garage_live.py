from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from genesis.garage_live import EventGarage


class RpcResponse:
    def __enter__(self) -> "RpcResponse":
        return self

    def __exit__(self, *_: Any) -> None:
        return None

    def read(self) -> bytes:
        return b'{"jsonrpc":"2.0","id":1,"result":"0x279f"}'


def test_rpc_identifies_the_client_to_monad() -> None:
    garage = EventGarage("0x" + "2" * 40)
    with patch("genesis.garage_live.urlopen", return_value=RpcResponse()) as opened:
        assert garage.rpc("eth_chainId", []) == "0x279f"
    request = opened.call_args.args[0]
    assert request.get_header("User-agent") == "genesis-harness/1.0"


class RecordingGarage(EventGarage):
    def __init__(self) -> None:
        super().__init__("0x" + "2" * 40)
        self.sent: list[tuple[int, int, int, int]] = []
        self.current = 7

    def champion(self) -> int:
        return self.current

    def broadcast(self, parent: int, motor: int, tires: int, boost: int) -> str:
        self.sent.append((parent, motor, tires, boost))
        return "0x" + "a" * 64


def test_walletless_challenge_is_scoped_current_and_idempotent() -> None:
    garage = RecordingGarage()
    token = garage.join(None)
    body = {"parent": 7, "motor": 0, "tires": 1, "boost": 3}
    assert garage.challenge(token, "request-123", body) == "0x" + "a" * 64
    assert garage.challenge(token, "request-123", body) == "0x" + "a" * 64
    assert garage.sent == [(7, 0, 1, 3)]
    with pytest.raises(ValueError, match="another challenge"):
        garage.challenge(token, "request-123", {**body, "boost": 2})
    garage.current = 8
    with pytest.raises(ValueError, match="champion changed"):
        garage.challenge(token, "request-456", body)


def test_join_reuses_an_existing_event_session() -> None:
    garage = RecordingGarage()
    token = garage.join(None)
    assert garage.join(token) == token


@pytest.mark.parametrize(
    "body",
    [
        {"parent": True, "motor": 0, "tires": 1, "boost": 3},
        {"parent": 0, "motor": 3, "tires": 0, "boost": 1},
        {"parent": 0, "motor": 2, "tires": 2, "boost": 1},
        {"parent": 0, "motor": 0, "tires": 0, "boost": 4},
    ],
)
def test_walletless_challenge_rejects_invalid_or_overbudget_cars(body: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        EventGarage.validate(body)


def test_walletless_challenge_requires_join_and_valid_request_id() -> None:
    garage = RecordingGarage()
    body = {"parent": 7, "motor": 0, "tires": 1, "boost": 3}
    with pytest.raises(ValueError, match="join"):
        garage.challenge("missing", "request-123", body)
    token = garage.join(None)
    with pytest.raises(ValueError, match="idempotency"):
        garage.challenge(token, "short", body)
