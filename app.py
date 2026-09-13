"""Servidor del juego "Conquista de Cajas 1vs1": FastAPI + Socket.IO."""

import asyncio
import pathlib

import socketio
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from game import (
    DEFAULT_MODE,
    MODES,
    RECONNECT_GRACE_SECONDS,
    TURN_SECONDS,
    GameManager,
    parse_line_key,
)

BASE_DIR = pathlib.Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", ping_timeout=60, ping_interval=25)
fastapi_app = FastAPI()
socket_app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

fastapi_app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

games = GameManager()


@fastapi_app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


def session_score_payload(player, opponent):
    """Marcador de la sesión (victorias de partida a partida, para el campeón)."""
    return {"scoreYou": player.wins, "scoreOpponent": opponent.wins}


def sanitize_name(raw) -> str:
    return str(raw or "").strip()[:20] or "Jugador"


def sanitize_avatar(raw) -> str:
    avatar = str(raw or "").strip()
    return avatar[:8] if avatar else "🙂"


def sanitize_mode(raw) -> str:
    mode = str(raw or "").strip().lower()
    return mode if mode in MODES else DEFAULT_MODE


def serialize_lines(room):
    lines = []
    for key, owner_sid in room.lines.items():
        line_type, row, col = parse_line_key(key)
        lines.append({"type": line_type, "row": row, "col": col, "by": owner_sid})
    return lines


def serialize_boxes(room):
    return [
        {"row": row, "col": col, "owner": info["owner"], "points": info["points"], "power": info["power"]}
        for (row, col), info in room.boxes.items()
    ]


def board_payload(room):
    return {"lines": serialize_lines(room), "boxes": serialize_boxes(room)}


async def start_room(room):
    """Emite match_found a ambos jugadores y arranca el temporizador de turno."""
    for player_sid, player in room.players.items():
        opponent = room.players[room.opponent_sid(player_sid)]
        await sio.enter_room(player_sid, room.id)
        await sio.emit(
            "match_found",
            {
                "yourTurn": room.turn_sid == player_sid,
                "opponentName": opponent.name,
                "opponentAvatar": opponent.avatar,
                "mode": room.mode,
                "turnSeconds": TURN_SECONDS,
                "boxesYou": player.score,
                "boxesOpponent": opponent.score,
                **board_payload(room),
                **session_score_payload(player, opponent),
            },
            to=player_sid,
        )
    sio.start_background_task(schedule_turn_timeout, room.id, room.turn_token)


async def schedule_turn_timeout(room_id: str, turn_token: int):
    await asyncio.sleep(TURN_SECONDS)

    result = games.expire_turn(room_id, turn_token)
    if result is None:
        return

    room = result["room"]
    timed_out_sid = result["timed_out_sid"]
    new_turn_sid = room.turn_sid

    await sio.emit(
        "turn_timeout",
        {"by": timed_out_sid, "yourTurn": False, "turnSeconds": TURN_SECONDS},
        to=timed_out_sid,
    )
    await sio.emit(
        "turn_timeout",
        {"by": timed_out_sid, "yourTurn": True, "turnSeconds": TURN_SECONDS},
        to=new_turn_sid,
    )
    sio.start_background_task(schedule_turn_timeout, room.id, room.turn_token)


async def schedule_disconnect_grace(room_id: str, sid: str):
    await asyncio.sleep(RECONNECT_GRACE_SECONDS)

    room = games.finalize_disconnect(room_id, sid)
    if room is None:
        return

    opponent_sid = next((s for s in room.players if s != sid), None)
    if opponent_sid:
        await sio.emit("opponent_left", {}, to=opponent_sid)


@sio.event
async def connect(sid, environ):
    print(f"Cliente conectado: {sid}")


@sio.event
async def disconnect(sid):
    room, lobby_other_sid = games.disconnect(sid)

    if lobby_other_sid:
        await sio.emit(
            "lobby_cancelled",
            {"message": "Tu amigo se ha desconectado. Vuelve a intentarlo."},
            to=lobby_other_sid,
        )

    if room is None:
        return

    opponent_sid = next((s for s in room.players if s != sid), None)
    if opponent_sid:
        await sio.emit("opponent_disconnected", {"graceSeconds": RECONNECT_GRACE_SECONDS}, to=opponent_sid)
    sio.start_background_task(schedule_disconnect_grace, room.id, sid)


@sio.event
async def join_game(sid, data):
    data = data or {}
    name = sanitize_name(data.get("name"))
    avatar = sanitize_avatar(data.get("avatar"))
    token = str(data.get("token") or "").strip()
    mode = sanitize_mode(data.get("mode"))

    if not token:
        await sio.emit("join_error", {"message": "Falta identificador de sesión. Recarga la página."}, to=sid)
        return

    status, room = games.join(sid, name, mode, avatar, token)

    if status == "waiting":
        await sio.emit("waiting_for_opponent", {}, to=sid)
        return

    await start_room(room)


@sio.event
async def create_room(sid, data):
    data = data or {}
    name = sanitize_name(data.get("name"))
    avatar = sanitize_avatar(data.get("avatar"))
    token = str(data.get("token") or "").strip()

    if not token:
        await sio.emit("join_error", {"message": "Falta identificador de sesión. Recarga la página."}, to=sid)
        return

    code = games.create_lobby(sid, name, avatar, token)
    await sio.emit("room_created", {"code": code}, to=sid)


def lobby_ready_payload(lobby, sid):
    is_host = sid == lobby.host_sid
    return {
        "isHost": is_host,
        "opponentName": lobby.guest_name if is_host else lobby.host_name,
        "opponentAvatar": lobby.guest_avatar if is_host else lobby.host_avatar,
    }


@sio.event
async def join_room(sid, data):
    data = data or {}
    code = str(data.get("code") or "").strip().upper()
    name = sanitize_name(data.get("name"))
    avatar = sanitize_avatar(data.get("avatar"))
    token = str(data.get("token") or "").strip()

    if not token:
        await sio.emit("join_room_error", {"message": "Falta identificador de sesión. Recarga la página."}, to=sid)
        return

    lobby = games.join_lobby(code, sid, name, avatar, token)
    if lobby is None:
        await sio.emit("join_room_error", {"message": "Ese código no es válido o ya no está disponible."}, to=sid)
        return

    await sio.emit("lobby_ready", lobby_ready_payload(lobby, lobby.host_sid), to=lobby.host_sid)
    await sio.emit("lobby_ready", lobby_ready_payload(lobby, lobby.guest_sid), to=lobby.guest_sid)


@sio.event
async def set_lobby_mode(sid, data):
    data = data or {}
    mode = sanitize_mode(data.get("mode"))

    room = games.set_lobby_mode(sid, mode)
    if room is None:
        return

    await start_room(room)


@sio.event
async def cancel_lobby(sid, data=None):
    games.cancel_waiting(sid)
    other_sid = games.cancel_lobby(sid)
    if other_sid:
        await sio.emit("lobby_cancelled", {"message": "Tu amigo ha cancelado la sala."}, to=other_sid)


@sio.event
async def rejoin(sid, data):
    data = data or {}
    token = str(data.get("token") or "").strip()
    if not token:
        await sio.emit("rejoin_failed", {}, to=sid)
        return

    room = games.rejoin(token, sid)
    if room is None:
        await sio.emit("rejoin_failed", {}, to=sid)
        return

    await sio.enter_room(sid, room.id)
    player = room.players[sid]
    opponent = room.players[room.opponent_sid(sid)]

    payload = {
        "opponentName": opponent.name,
        "opponentAvatar": opponent.avatar,
        "mode": room.mode,
        "boxesYou": player.score,
        "boxesOpponent": opponent.score,
        **board_payload(room),
        **session_score_payload(player, opponent),
    }

    if room.finished:
        payload["state"] = "finished"
        last_result = room.last_result or {}
        payload["draw"] = bool(last_result.get("draw"))
        payload["won"] = (not payload["draw"]) and last_result.get("winner_token") == player.token
        payload["reason"] = last_result.get("reason", "complete")
    else:
        payload["state"] = "playing"
        payload["yourTurn"] = room.turn_sid == sid
        payload["turnSeconds"] = TURN_SECONDS

    await sio.emit("rejoined", payload, to=sid)
    await sio.emit("opponent_reconnected", {}, to=opponent.sid)


@sio.event
async def draw_line(sid, data):
    data = data or {}
    line_type = str(data.get("type") or "")
    try:
        row = int(data.get("row"))
        col = int(data.get("col"))
    except (TypeError, ValueError):
        await sio.emit("line_error", {"message": "Movimiento no válido."}, to=sid)
        return

    result = games.draw_line(sid, line_type, row, col)
    if result is None:
        await sio.emit("line_error", {"message": "No es tu turno o esa línea ya no está disponible."}, to=sid)
        return

    room = result["room"]
    mover = result["mover"]

    for target_sid, target_player in room.players.items():
        opponent = room.players[room.opponent_sid(target_sid)]
        await sio.emit(
            "line_drawn",
            {
                "by": mover.sid,
                "line": result["line"],
                "completed": result["completed"],
                "yourTurn": (not result["finished"]) and room.turn_sid == target_sid,
                "turnSeconds": TURN_SECONDS,
                "boxesYou": target_player.score,
                "boxesOpponent": opponent.score,
            },
            to=target_sid,
        )

    if not result["finished"]:
        sio.start_background_task(schedule_turn_timeout, room.id, room.turn_token)
        return

    winner = result["winner"]
    champion = result["champion"]
    draw = result["draw"]
    p1, p2 = room.players.values()

    for player, opponent in ((p1, p2), (p2, p1)):
        payload = {
            "won": (not draw) and winner is not None and winner.sid == player.sid,
            "draw": draw,
            "boxesYou": player.score,
            "boxesOpponent": opponent.score,
            "reason": "complete",
            "champion": champion,
            **session_score_payload(player, opponent),
        }
        await sio.emit("game_over", payload, to=player.sid)

    if champion:
        p1.wins = 0
        p2.wins = 0


@sio.event
async def surrender(sid, data=None):
    result = games.surrender(sid)
    if result is None:
        return

    quitter = result["quitter"]
    winner = result["winner"]
    champion = result["champion"]

    payload_quitter = {
        "won": False,
        "draw": False,
        "boxesYou": quitter.score,
        "boxesOpponent": winner.score,
        "reason": "surrender",
        "champion": champion,
        **session_score_payload(quitter, winner),
    }
    payload_winner = {
        "won": True,
        "draw": False,
        "boxesYou": winner.score,
        "boxesOpponent": quitter.score,
        "reason": "surrender",
        "champion": champion,
        **session_score_payload(winner, quitter),
    }
    if champion:
        quitter.wins = 0
        winner.wins = 0
    await sio.emit("game_over", payload_quitter, to=quitter.sid)
    await sio.emit("game_over", payload_winner, to=winner.sid)


@sio.event
async def request_rematch(sid, data=None):
    result = games.submit_rematch_ready(sid)
    if result is None:
        await sio.emit("rematch_error", {"message": "La partida ya no existe. Busca un rival nuevo."}, to=sid)
        return

    status, room = result

    if status == "waiting":
        await sio.emit("rematch_waiting", {}, to=sid)
        return

    for player_sid, player in room.players.items():
        opponent = room.players[room.opponent_sid(player_sid)]
        await sio.emit(
            "rematch_started",
            {
                "yourTurn": room.turn_sid == player_sid,
                "turnSeconds": TURN_SECONDS,
                "boxesYou": player.score,
                "boxesOpponent": opponent.score,
                **session_score_payload(player, opponent),
            },
            to=player_sid,
        )

    sio.start_background_task(schedule_turn_timeout, room.id, room.turn_token)


@sio.event
async def send_chat(sid, data):
    data = data or {}
    text = str(data.get("text") or "").strip()[:200]
    if not text:
        return

    room = games.get_room(sid)
    if not room:
        return

    sender = room.players.get(sid)
    if not sender:
        return

    await sio.emit(
        "chat_message",
        {"by": sid, "name": sender.name, "avatar": sender.avatar, "text": text},
        to=room.id,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:socket_app", host="0.0.0.0", port=8000, reload=True)
