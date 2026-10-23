import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Memory:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY, session TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
            db.execute("CREATE INDEX IF NOT EXISTS session_messages ON messages(session, id)")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def history(self, session: str, limit: int):
        with self.connection() as db:
            rows = db.execute(
                "SELECT role, content FROM messages WHERE session=? ORDER BY id DESC LIMIT ?",
                (session, limit),
            ).fetchall()
        return [{"role": role, "content": content} for role, content in reversed(rows)]

    def save_turn(self, session: str, question: str, answer: str):
        with self.connection() as db:
            db.executemany("INSERT INTO messages(session,role,content) VALUES (?,?,?)",
                           [(session, "user", question), (session, "assistant", answer)])

    def delete(self, session: str):
        with self.connection() as db:
            db.execute("DELETE FROM messages WHERE session=?", (session,))

    def sessions(self):
        with self.connection() as db:
            rows = db.execute("""SELECT session,
                (SELECT substr(content,1,60) FROM messages AS first
                 WHERE first.session=m.session AND first.role='user' ORDER BY id LIMIT 1),
                max(id) AS latest FROM messages AS m GROUP BY session
                ORDER BY latest DESC LIMIT 100""").fetchall()
        return [{"id": session, "title": title or "Conversación"} for session, title, _ in rows]
