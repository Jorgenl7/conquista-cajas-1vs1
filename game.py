"""Lógica del juego: cola de emparejamiento, salas de partida y reglas de
"Conquista de Cajas" (Dots and Boxes) con Modo Clásico y Modo Caos."""

import random
import uuid
from dataclasses import dataclass, field
from typing import Optional

DOT_GRID = 6  # puntos por lado -> 5x5 cajas
BOX_GRID = DOT_GRID - 1
TOTAL_BOXES = BOX_GRID * BOX_GRID

TURN_SECONDS = 60
RECONNECT_GRACE_SECONDS = 60
CHAMPION_WINS = 3

MODES = ("classic", "chaos")
DEFAULT_MODE = "classic"

POWER_COUNT = 4
POWER_TYPES = ("bomb", "multiplier", "ice")
MULTIPLIER_POINTS = 3
BOMB_LINES_REMOVED = 2

ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin caracteres ambiguos (0/O, 1/I)
ROOM_CODE_LENGTH = 5


def generate_room_code() -> str:
    return "".join(random.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))


def is_valid_mode(value) -> bool:
    return value in MODES


def line_key(line_type: str, row: int, col: int) -> str:
    return f"{line_type}-{row}-{col}"


def parse_line_key(key: str):
    line_type, row, col = key.split("-")
    return line_type, int(row), int(col)


def is_valid_line(line_type: str, row: int, col: int) -> bool:
    """Una línea horizontal 'h' une (row,col)-(row,col+1); una vertical 'v' une
    (row,col)-(row+1,col), sobre una cuadrícula de DOT_GRID x DOT_GRID puntos."""
    if line_type == "h":
        return 0 <= row < DOT_GRID and 0 <= col < BOX_GRID
    if line_type == "v":
        return 0 <= row < BOX_GRID and 0 <= col < DOT_GRID
    return False


def boxes_for_line(line_type: str, row: int, col: int):
    """Devuelve las cajas (hasta 2) que tienen esta línea como uno de sus lados."""
    boxes = []
    if line_type == "h":
        if row - 1 >= 0:
            boxes.append((row - 1, col))
        if row <= BOX_GRID - 1:
            boxes.append((row, col))
    else:
        if col - 1 >= 0:
            boxes.append((row, col - 1))
        if col <= BOX_GRID - 1:
            boxes.append((row, col))
    return boxes


def lines_for_box(row: int, col: int):
    return [("h", row, col), ("h", row + 1, col), ("v", row, col), ("v", row, col + 1)]


def box_is_complete(lines: dict, row: int, col: int) -> bool:
    return all(line_key(*side) in lines for side in lines_for_box(row, col))


def line_is_locked(boxes: dict, line_type: str, row: int, col: int) -> bool:
    """Una línea está "bloqueada" si forma parte de una caja ya conquistada:
    quitarla dejaría el marcador desincronizado con las líneas del tablero."""
    return any(box in boxes for box in boxes_for_line(line_type, row, col))


@dataclass
class Player:
    sid: str
    name: str
    avatar: str
    token: str
    score: int = 0
    wins: int = 0
    ice_debuff: bool = False


@dataclass
class Lobby:
    """Sala de amigos: primero se unen los dos jugadores y luego el anfitrión
    elige el modo de juego, lo que arranca la partida al instante (no hay
    secretos ni configuración adicional que esperar)."""

    code: str
    host_sid: str
    host_name: str
    host_avatar: str
    host_token: str
    guest_sid: Optional[str] = None
    guest_name: Optional[str] = None
    guest_avatar: Optional[str] = None
    guest_token: Optional[str] = None

    def other_sid(self, sid: str) -> Optional[str]:
        if sid == self.host_sid:
            return self.guest_sid
        if sid == self.guest_sid:
            return self.host_sid
        return None


@dataclass
class Room:
    id: str
    mode: str
    players: dict  # sid -> Player
    turn_sid: str
    lines: dict = field(default_factory=dict)  # line_key -> sid propietario
    boxes: dict = field(default_factory=dict)  # (row, col) -> {"owner","points","power"}
    powers: dict = field(default_factory=dict)  # (row, col) -> power_type, oculto hasta conquistarse
    finished: bool = False
    turn_token: int = 0
    last_winner_sid: Optional[str] = None
    rematch_ready: set = field(default_factory=set)
    disconnected_sid: Optional[str] = None
    last_result: Optional[dict] = None  # {"reason", "winner_token", "draw"}

    def opponent_sid(self, sid: str) -> str:
        return next(s for s in self.players if s != sid)


class GameManager:
    """Mantiene en memoria la cola de espera y las partidas activas."""

    def __init__(self):
        self.waiting: dict[str, dict] = {}
        self.rooms: dict[str, Room] = {}
        self.sid_to_room: dict[str, str] = {}
        self.token_to_room: dict[str, str] = {}
        self.lobbies: dict[str, Lobby] = {}
        self.sid_to_lobby: dict[str, str] = {}

    # ---------- Emparejamiento ----------

    def join(self, sid: str, name: str, mode: str, avatar: str, token: str):
        """Añade al jugador a la cola de su modo o, si ya había alguien esperando
        con el mismo modo, crea la sala directamente: en Conquista de Cajas no
        hay secretos que configurar, así que la partida puede arrancar ya.

        Devuelve (estado, room) con estado "waiting" o "matched".
        """
        self.cancel_lobby(sid)
        pending = self.waiting.get(mode)
        if pending is None:
            self.waiting[mode] = {"sid": sid, "name": name, "avatar": avatar, "token": token}
            return "waiting", None

        del self.waiting[mode]
        room = self._build_room(pending, {"sid": sid, "name": name, "avatar": avatar, "token": token}, mode)
        return "matched", room

    def cancel_waiting(self, sid: str) -> None:
        for mode, pending in list(self.waiting.items()):
            if pending["sid"] == sid:
                del self.waiting[mode]

    def _build_room(self, info1: dict, info2: dict, mode: str) -> Room:
        room_id = uuid.uuid4().hex[:8]
        p1 = Player(sid=info1["sid"], name=info1["name"], avatar=info1["avatar"], token=info1["token"])
        p2 = Player(sid=info2["sid"], name=info2["name"], avatar=info2["avatar"], token=info2["token"])
        first_sid = random.choice([p1.sid, p2.sid])

        room = Room(
            id=room_id,
            mode=mode,
            players={p1.sid: p1, p2.sid: p2},
            turn_sid=first_sid,
            powers=self._generate_powers() if mode == "chaos" else {},
        )
        self.rooms[room_id] = room
        self.sid_to_room[p1.sid] = room_id
        self.sid_to_room[p2.sid] = room_id
        self.token_to_room[p1.token] = room_id
        self.token_to_room[p2.token] = room_id
        return room

    @staticmethod
    def _generate_powers() -> dict:
        all_boxes = [(r, c) for r in range(BOX_GRID) for c in range(BOX_GRID)]
        chosen = random.sample(all_boxes, POWER_COUNT)
        return {box: random.choice(POWER_TYPES) for box in chosen}

    def get_room(self, sid: str) -> Optional[Room]:
        room_id = self.sid_to_room.get(sid)
        return self.rooms.get(room_id) if room_id else None

    # ---------- Jugadas ----------

    def draw_line(self, sid: str, line_type: str, row: int, col: int) -> Optional[dict]:
        """Traza una línea, resuelve las cajas que cierre (y sus poderes) y
        actualiza el turno. Devuelve None si la jugada no es válida."""
        room = self.get_room(sid)
        if not room or room.finished or room.turn_sid != sid:
            return None
        if not is_valid_line(line_type, row, col):
            return None

        key = line_key(line_type, row, col)
        if key in room.lines:
            return None

        room.lines[key] = sid
        player = room.players[sid]
        opponent = room.players[room.opponent_sid(sid)]

        completed = []
        for (br, bc) in boxes_for_line(line_type, row, col):
            if (br, bc) in room.boxes or not box_is_complete(room.lines, br, bc):
                continue

            power = room.powers.pop((br, bc), None)
            points = MULTIPLIER_POINTS if power == "multiplier" else 1
            room.boxes[(br, bc)] = {"owner": sid, "points": points, "power": power}
            player.score += points

            box_info = {"row": br, "col": bc, "owner": sid, "points": points, "power": power}
            if power == "bomb":
                box_info["bombRemoved"] = self._trigger_bomb(room, sid)
            elif power == "ice":
                opponent.ice_debuff = True
                box_info["iceAppliedTo"] = opponent.sid
            completed.append(box_info)

        result = {
            "room": room,
            "mover": player,
            "opponent": opponent,
            "line": {"type": line_type, "row": row, "col": col, "by": sid},
            "completed": completed,
            "finished": False,
            "winner": None,
            "draw": False,
            "champion": False,
        }

        if len(room.boxes) >= TOTAL_BOXES:
            winner, champion = self._finish_room(room)
            result["finished"] = True
            result["winner"] = winner
            result["draw"] = winner is None
            result["champion"] = champion
            return result

        extra_turn = bool(completed)
        if extra_turn and player.ice_debuff:
            player.ice_debuff = False
            extra_turn = False

        if not extra_turn:
            room.turn_sid = opponent.sid
        room.turn_token += 1
        return result

    def _trigger_bomb(self, room: Room, sid: str) -> list:
        """Destruye hasta BOMB_LINES_REMOVED líneas al azar del rival, mirando
        solo las que no formen parte de una caja ya conquistada (para no dejar
        el marcador inconsistente con el tablero)."""
        opponent = room.players[room.opponent_sid(sid)]
        eligible = [
            key
            for key, owner in room.lines.items()
            if owner == opponent.sid and not line_is_locked(room.boxes, *parse_line_key(key))
        ]
        chosen = random.sample(eligible, min(BOMB_LINES_REMOVED, len(eligible)))
        removed = []
        for key in chosen:
            del room.lines[key]
            line_type, row, col = parse_line_key(key)
            removed.append({"type": line_type, "row": row, "col": col})
        return removed

    def _finish_room(self, room: Room, reason: str = "complete"):
        room.finished = True
        p1, p2 = room.players.values()
        if p1.score > p2.score:
            winner = p1
        elif p2.score > p1.score:
            winner = p2
        else:
            winner = None

        champion = False
        if winner:
            winner.wins += 1
            room.last_winner_sid = winner.sid
            champion = winner.wins >= CHAMPION_WINS

        room.last_result = {
            "reason": reason,
            "winner_token": winner.token if winner else None,
            "draw": winner is None,
        }
        return winner, champion

    def surrender(self, sid: str) -> Optional[dict]:
        """Rinde la partida: el rival gana automáticamente."""
        room = self.get_room(sid)
        if not room or room.finished:
            return None

        quitter = room.players[sid]
        winner = room.players[room.opponent_sid(sid)]
        room.finished = True
        room.last_winner_sid = winner.sid
        winner.wins += 1
        room.last_result = {"reason": "surrender", "winner_token": winner.token, "draw": False}
        champion = winner.wins >= CHAMPION_WINS
        return {"room": room, "quitter": quitter, "winner": winner, "champion": champion}

    def expire_turn(self, room_id: str, expected_token: int) -> Optional[dict]:
        """Si el turno sigue vigente tras agotarse el tiempo, lo pasa al rival."""
        room = self.rooms.get(room_id)
        if not room or room.finished or room.turn_token != expected_token:
            return None

        timed_out_sid = room.turn_sid
        opponent = room.players[room.opponent_sid(timed_out_sid)]
        room.turn_sid = opponent.sid
        room.turn_token += 1
        return {"room": room, "timed_out_sid": timed_out_sid}

    def submit_rematch_ready(self, sid: str):
        """Marca a `sid` listo para la revancha. Cuando ambos lo están, reinicia
        el tablero (con nuevos poderes ocultos si el modo es Caos).

        Devuelve (estado, room) con estado "waiting" o "started", o None si no procede.
        """
        room = self.get_room(sid)
        if not room or not room.finished:
            return None

        room.rematch_ready.add(sid)
        if len(room.rematch_ready) < 2:
            return "waiting", room

        for player in room.players.values():
            player.score = 0
            player.ice_debuff = False

        room.lines = {}
        room.boxes = {}
        room.powers = self._generate_powers() if room.mode == "chaos" else {}

        loser_sid = (
            room.opponent_sid(room.last_winner_sid) if room.last_winner_sid else random.choice(list(room.players))
        )
        room.turn_sid = loser_sid
        room.turn_token += 1
        room.finished = False
        room.rematch_ready.clear()
        room.last_result = None
        return "started", room

    # ---------- Salas de amigos ----------

    def create_lobby(self, sid: str, name: str, avatar: str, token: str) -> str:
        """Crea una sala de amigos vacía, pendiente de que se una un invitado."""
        self.cancel_waiting(sid)
        self.cancel_lobby(sid)
        code = generate_room_code()
        while code in self.lobbies:
            code = generate_room_code()
        self.lobbies[code] = Lobby(code=code, host_sid=sid, host_name=name, host_avatar=avatar, host_token=token)
        self.sid_to_lobby[sid] = code
        return code

    def get_lobby(self, sid: str) -> Optional[Lobby]:
        code = self.sid_to_lobby.get(sid)
        return self.lobbies.get(code) if code else None

    def join_lobby(self, code: str, sid: str, name: str, avatar: str, token: str) -> Optional[Lobby]:
        """Une a un segundo jugador a la sala `code`. Devuelve la Lobby, o None si no procede."""
        lobby = self.lobbies.get(code)
        if not lobby or lobby.guest_sid is not None or lobby.host_sid == sid:
            return None

        self.cancel_waiting(sid)
        self.cancel_lobby(sid)
        lobby = self.lobbies.get(code)
        if not lobby or lobby.guest_sid is not None:
            return None

        lobby.guest_sid = sid
        lobby.guest_name = name
        lobby.guest_avatar = avatar
        lobby.guest_token = token
        self.sid_to_lobby[sid] = code
        return lobby

    def set_lobby_mode(self, sid: str, mode: str) -> Optional[Room]:
        """El anfitrión fija el modo de juego. Como no hace falta que nadie
        elija nada más, esto arranca la partida al instante."""
        lobby = self.get_lobby(sid)
        if not lobby or lobby.host_sid != sid or lobby.guest_sid is None:
            return None

        del self.lobbies[lobby.code]
        self.sid_to_lobby.pop(lobby.host_sid, None)
        self.sid_to_lobby.pop(lobby.guest_sid, None)

        info1 = {
            "sid": lobby.host_sid,
            "name": lobby.host_name,
            "avatar": lobby.host_avatar,
            "token": lobby.host_token,
        }
        info2 = {
            "sid": lobby.guest_sid,
            "name": lobby.guest_name,
            "avatar": lobby.guest_avatar,
            "token": lobby.guest_token,
        }
        return self._build_room(info1, info2, mode)

    def cancel_lobby(self, sid: str) -> Optional[str]:
        """Cierra la sala de amigos de `sid` (si la hay) y devuelve el sid del otro
        jugador (si ya se había unido), para poder avisarle."""
        code = self.sid_to_lobby.pop(sid, None)
        if not code:
            return None
        lobby = self.lobbies.pop(code, None)
        if not lobby:
            return None
        other_sid = lobby.other_sid(sid)
        if other_sid:
            self.sid_to_lobby.pop(other_sid, None)
        return other_sid

    def remove_room(self, room_id: str) -> None:
        room = self.rooms.pop(room_id, None)
        if room:
            for player in room.players.values():
                self.sid_to_room.pop(player.sid, None)
                self.token_to_room.pop(player.token, None)

    def disconnect(self, sid: str):
        """Gestiona la desconexión de un socket: sale de la cola, cierra su sala de
        amigos pendiente (si la había) y marca su partida como pendiente de
        reconexión (no se borra al instante).

        Devuelve (room, lobby_other_sid): `room` si estaba en una partida activa,
        y el sid del otro jugador de su sala de amigos (si la había) para avisarle.
        """
        self.cancel_waiting(sid)
        lobby_other_sid = self.cancel_lobby(sid)
        room = self.get_room(sid)
        if room:
            room.disconnected_sid = sid
        return room, lobby_other_sid

    def finalize_disconnect(self, room_id: str, sid: str) -> Optional[Room]:
        """Tras agotarse el tiempo de gracia sin reconexión, cierra la sala definitivamente."""
        room = self.rooms.get(room_id)
        if not room or room.disconnected_sid != sid:
            return None
        self.remove_room(room_id)
        return room

    def rejoin(self, token: str, new_sid: str) -> Optional[Room]:
        """Reasocia una sala existente a una nueva conexión (tras recargar la página)."""
        room_id = self.token_to_room.get(token)
        room = self.rooms.get(room_id) if room_id else None
        if not room:
            return None

        old_sid = next((p.sid for p in room.players.values() if p.token == token), None)
        if old_sid is None:
            return None

        player = room.players.pop(old_sid)
        player.sid = new_sid
        room.players[new_sid] = player

        self.sid_to_room.pop(old_sid, None)
        self.sid_to_room[new_sid] = room.id

        # El sid antiguo queda grabado como propietario de líneas/cajas ya
        # jugadas: hay que actualizarlo para que el cliente que reconecta
        # pueda distinguir sus propias piezas comparando con su nuevo socket.id.
        for key, owner in list(room.lines.items()):
            if owner == old_sid:
                room.lines[key] = new_sid
        for info in room.boxes.values():
            if info["owner"] == old_sid:
                info["owner"] = new_sid

        if room.turn_sid == old_sid:
            room.turn_sid = new_sid
        if room.last_winner_sid == old_sid:
            room.last_winner_sid = new_sid
        if room.disconnected_sid == old_sid:
            room.disconnected_sid = None
        if old_sid in room.rematch_ready:
            room.rematch_ready.discard(old_sid)
            room.rematch_ready.add(new_sid)

        return room
