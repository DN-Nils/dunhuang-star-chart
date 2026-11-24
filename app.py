# -*- coding: utf-8 -*-
"""
敦煌古星图 · 3D天球 —— FastAPI 后端（智能体 SSE + 观星社区）

用法：
    pip install fastapi uvicorn
    python app.py          # 启动后访问 http://127.0.0.1:8000/敦煌星图3D天球.html

说明：
- 本文件同时托管页面与 assets/：python app.py 起来后，浏览器直接访问上面地址即可，
  相对路径 /api/* 与页面同源，观星社区自动进入「多人共享模式」。
- 不启动本文件时，页面照常双击打开：社区回落为 localStorage 本地模式，其余功能不受影响。
- 智能体问答为规则演示应答（无需任何 API Key）；接入真实大模型：在 plan() 里替换为对
  通义千问 / DeepSeek / 智谱 等兼容 OpenAI 格式接口的流式调用即可。

社区数据（SQLite，community.db 与本文件同目录）：
- users / sessions / posts / likes / comments 五张表，全部参数化查询；
- 密码 PBKDF2-HMAC-SHA256（12 万轮 + 独立盐），不存明文；
- 会话 token（secrets 生成）落在 sessions 表，服务重启不掉线。
"""
import asyncio
import hashlib
import json
import os
import secrets
import sqlite3
import time

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "community.db")

app = FastAPI(title="敦煌古星图智能体 · 观星社区")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 观星社区：SQLite 存储（C6 账号 / C7 数据与安全）
# ============================================================
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users(
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                nick     TEXT UNIQUE NOT NULL,
                pw_hash  TEXT NOT NULL,
                salt     TEXT NOT NULL,
                created  REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions(
                token    TEXT PRIMARY KEY,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created  REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS posts(
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                nick     TEXT NOT NULL,
                text     TEXT NOT NULL,
                snap     TEXT,
                likes    INTEGER NOT NULL DEFAULT 0,
                created  REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS likes(
                post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY(post_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS comments(
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                nick     TEXT NOT NULL,
                text     TEXT NOT NULL,
                created  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created DESC);
            CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created);
            """
        )


init_db()


def hash_pw(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()


def clean_text(s: str, limit: int) -> str:
    """存储前统一去首尾空白并限长；渲染端一律 textContent，双保险防 XSS。"""
    s = (s or "").strip()
    return s[:limit]


def user_of_token(token: str):
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            "SELECT u.id, u.nick FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        ).fetchone()
    return dict(row) if row else None


class NickPass(BaseModel):
    nick: str
    password: str


class PostReq(BaseModel):
    token: str
    text: str
    snap: dict | None = None


class LikeReq(BaseModel):
    token: str
    post_id: int


class CommentReq(BaseModel):
    token: str
    post_id: int
    text: str


class TokenReq(BaseModel):
    token: str


@app.get("/api/community/status")
def community_status():
    with db() as conn:
        users = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
        posts = conn.execute("SELECT COUNT(*) c FROM posts").fetchone()["c"]
    return {"ok": True, "users": users, "posts": posts}


@app.post("/api/community/register")
def community_register(req: NickPass):
    nick = clean_text(req.nick, 12)
    pw = (req.password or "").strip()
    if not nick or any(ch in nick for ch in "<>&\"'"):
        raise HTTPException(400, "昵称需 1–12 个字符，且不含尖括号引号")
    if len(pw) < 4 or len(pw) > 64:
        raise HTTPException(400, "密码需 4–64 位")
    salt = secrets.token_hex(8)
    try:
        with db() as conn:
            cur = conn.execute(
                "INSERT INTO users(nick, pw_hash, salt, created) VALUES(?,?,?,?)",
                (nick, hash_pw(pw, salt), salt, time.time()),
            )
            uid = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "这个昵称已被使用")
    token = secrets.token_hex(16)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token, user_id, created) VALUES(?,?,?)", (token, uid, time.time()))
    return {"ok": True, "token": token, "nick": nick}


@app.post("/api/community/login")
def community_login(req: NickPass):
    nick = clean_text(req.nick, 12)
    with db() as conn:
        row = conn.execute("SELECT id, pw_hash, salt FROM users WHERE nick = ?", (nick,)).fetchone()
    if not row or hash_pw((req.password or "").strip(), row["salt"]) != row["pw_hash"]:
        raise HTTPException(401, "昵称或密码不正确")
    token = secrets.token_hex(16)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token, user_id, created) VALUES(?,?,?)", (token, row["id"], time.time()))
    return {"ok": True, "token": token, "nick": nick}


@app.post("/api/community/logout")
def community_logout(req: TokenReq):
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (req.token,))
    return {"ok": True}


@app.get("/api/community/me")
def community_me(token: str = ""):
    u = user_of_token(token)
    if not u:
        raise HTTPException(401, "登录已过期")
    return {"ok": True, "nick": u["nick"]}


def _post_dict(row, uid):
    d = dict(row)
    d["snap"] = json.loads(d["snap"]) if d["snap"] else None
    d["mine"] = (uid is not None and d["user_id"] == uid)
    return d


@app.get("/api/community/posts")
def community_posts(token: str = ""):
    u = user_of_token(token)
    uid = u["id"] if u else None
    with db() as conn:
        rows = conn.execute(
            "SELECT p.id, p.user_id, p.nick, p.text, p.snap, p.likes, p.created, "
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments "
            "FROM posts p ORDER BY p.id DESC LIMIT 100"
        ).fetchall()
        liked = set()
        if uid is not None:
            for r in conn.execute("SELECT post_id FROM likes WHERE user_id = ?", (uid,)):
                liked.add(r["post_id"])
    out = []
    for r in rows:
        d = _post_dict(r, uid)
        d["liked"] = d["id"] in liked
        out.append(d)
    return {"ok": True, "posts": out}


@app.post("/api/community/posts")
def community_publish(req: PostReq):
    u = user_of_token(req.token)
    if not u:
        raise HTTPException(401, "请先登录")
    text = clean_text(req.text, 300)
    if not text:
        raise HTTPException(400, "内容不能为空")
    snap = json.dumps(req.snap, ensure_ascii=True) if req.snap else None
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO posts(user_id, nick, text, snap, likes, created) VALUES(?,?,?,?,0,?)",
            (u["id"], u["nick"], text, snap, time.time()),
        )
        pid = cur.lastrowid
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (pid,)).fetchone()
    return {"ok": True, "post": _post_dict(row, u["id"])}


@app.post("/api/community/like")
def community_like(req: LikeReq):
    u = user_of_token(req.token)
    if not u:
        raise HTTPException(401, "请先登录")
    with db() as conn:
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (req.post_id,)).fetchone()
        if not post:
            raise HTTPException(404, "动态不存在")
        had = conn.execute(
            "SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?", (req.post_id, u["id"])
        ).fetchone()
        if had:
            conn.execute("DELETE FROM likes WHERE post_id = ? AND user_id = ?", (req.post_id, u["id"]))
            conn.execute("UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?", (req.post_id,))
            liked = False
        else:
            conn.execute("INSERT INTO likes(post_id, user_id) VALUES(?,?)", (req.post_id, u["id"]))
            conn.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (req.post_id,))
            liked = True
        likes = conn.execute("SELECT likes FROM posts WHERE id = ?", (req.post_id,)).fetchone()["likes"]
    return {"ok": True, "likes": likes, "liked": liked}


@app.get("/api/community/comments")
def community_comments(post_id: int):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, nick, text, created FROM comments WHERE post_id = ? ORDER BY id LIMIT 200",
            (post_id,),
        ).fetchall()
    return {"ok": True, "comments": [dict(r) for r in rows]}


@app.post("/api/community/comment")
def community_comment(req: CommentReq):
    u = user_of_token(req.token)
    if not u:
        raise HTTPException(401, "请先登录")
    text = clean_text(req.text, 140)
    if not text:
        raise HTTPException(400, "评论不能为空")
    with db() as conn:
        post = conn.execute("SELECT id FROM posts WHERE id = ?", (req.post_id,)).fetchone()
        if not post:
            raise HTTPException(404, "动态不存在")
        cur = conn.execute(
            "INSERT INTO comments(post_id, user_id, nick, text, created) VALUES(?,?,?,?,?)",
            (req.post_id, u["id"], u["nick"], text, time.time()),
        )
        row = conn.execute("SELECT id, nick, text, created FROM comments WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"ok": True, "comment": dict(row)}


# ============================================================
# 智能体问答（SSE 流式，规则演示）
# ============================================================
STAR_INFO = {
    "北斗": "斗柄东指，天下皆春；斗柄南指，天下皆夏；斗柄西指，天下皆秋；斗柄北指，天下皆冬。——《鹖冠子》",
    "心": "东方苍龙第五宿，心宿三星，心宿二即大火星，上古以大火授时。",
    "昴": "西方白虎第四宿，昴宿七星，昴为髦头，主狱事，春分前后昏中。",
    "参": "西方白虎第七宿，参宿七星，参为白虎，主杀伐。",
    "井": "南方朱雀第一宿，井宿八星，井主水衡事，主泉源。",
}
TERM_STAR = {
    "春分": "昴", "清明": "毕", "谷雨": "参", "立夏": "井", "小满": "鬼",
    "芒种": "柳", "夏至": "星", "小暑": "张", "大暑": "翼", "立秋": "角",
    "处暑": "亢", "白露": "氐", "秋分": "心", "寒露": "尾", "霜降": "箕",
    "立冬": "斗", "小雪": "牛", "大雪": "女", "冬至": "虚", "小寒": "危",
    "大寒": "室", "立春": "壁", "雨水": "奎", "惊蛰": "娄",
}


class ChatRequest(BaseModel):
    message: str


def plan(q: str):
    """智能体规划：返回 (思考步骤列表, 回答文本, 要高亮的星宿名或 None)。"""
    steps = ["解析问题意图…", "检索古天文知识库…", "核对星宿与节气对应关系…", "整理结论…"]
    for name, term in TERM_STAR.items():
        if name in q:
            steps = [
                f"命中节气：{name}",
                f"查询昏中星表 → 当值星宿：{term}宿",
                "结合星官文献整理说明…",
            ]
            return steps, f"{name}（黄经对应）之夜，南中天昏中星为{term}宿。古人观此星以定农时。", term
    for name, info in STAR_INFO.items():
        if name in q:
            return ["定位星宿：" + name, "调取星官条目…"], f"【{name}】{info}", name
    if "敦煌" in q or "星图" in q:
        return ["定位文物：敦煌星图（莫高窟藏经洞）…", "提取星官体系与授时意义…"], (
            "敦煌星图是现存最早、最完整的手绘星图之一，绘制于唐代，以赤道坐标绘出"
            "三垣二十八宿约1300余颗星，是古人观象授时、以星定节气的实证。"
        ), None
    return steps, "可尝试问：某节气的当值星宿（如“冬至夜观何星”）、某宿的记载（如“心宿”），或“敦煌星图”。", None


async def _sse(request: ChatRequest):
    q = request.message
    steps, answer, star = plan(q)
    for s in steps:
        yield "data: " + json.dumps({"type": "think", "content": s + "\n"}, ensure_ascii=False) + "\n\n"
        await asyncio.sleep(0.28)
    if star:
        yield "data: " + json.dumps({"type": "highlight", "content": star}, ensure_ascii=False) + "\n\n"
        await asyncio.sleep(0.15)
    for ch in answer:
        yield "data: " + json.dumps({"type": "answer", "content": ch}, ensure_ascii=False) + "\n\n"
        await asyncio.sleep(0.02)
    yield "data: " + json.dumps({"type": "done"}) + "\n\n"


@app.get("/api/health")
def health():
    return {"status": "ok", "community": True}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(_sse(req), media_type="text/event-stream")


# ============================================================
# 静态托管：python app.py 后直接访问 http://127.0.0.1:8000/敦煌星图3D天球.html
# （API 路由先注册，挂载在后的静态目录不影响 /api/*）
# ============================================================
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="site")


if __name__ == "__main__":
    print("观星社区后端已就绪：http://127.0.0.1:8000/" + "敦煌星图3D天球.html")
    uvicorn.run(app, host="127.0.0.1", port=8000)
