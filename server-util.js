const WebSocket = require("ws");
const express = require("express");
const expressWs = require("express-ws");

// Hacks to run penpa-edit on NodeJS server side
Zlib = this.Zlib;
$.fn.toggleSelect2 = () => {};
md5 = require("md5");

boot();

pu.ctx.text = () => {};
panel_pu.ctxf.text = () => {};

const app = express();
expressWs(app);

// Static files
const modifiedClientHtml = clientHtml.toString().replace(
    "</head>",
    `<link rel="stylesheet" href="/style.css">
    <script type="text/javascript">
    ${fs.readFileSync("common.js")}
    ${fs.readFileSync("client-util.js")}
    ${fs.readFileSync("client-penpa.js")}
    ${fs.readFileSync("client-history.js")}
    ${fs.readFileSync("client.js")}
    </script>
    </head>`
);
app.get("/:puzzleId/penpa-edit", (_, res) => {
    res.type("html");
    res.send(modifiedClientHtml);
});
app.use("/:puzzleId/penpa-edit", express.static("penpa-edit/docs"));
app.use("/", express.static("public"));

// Puzzle API
const clients = {};
const puzzles = {};
app.use(express.json());
app.post("/api/puzzles", (req, res) => {
    res.send(
        Object.fromEntries(
            req.body.puzzleIds
                .filter(puzzleId => getPuzzle(puzzleId) !== undefined)
                .map(puzzleId => [puzzleId, { name: puzzles[puzzleId].name }])
        )
    );
});
app.post("/api/create", (req, res) => {
    const puzzleId = randomId();
    create_newboard();
    puzzles[puzzleId] = {
        pu,
        name: req.body.name,
        clients: new Set(),
    };
    res.send({ puzzleId });
});

// Websocket to listen and broadcast puzzle updates
app.ws("/ws", ws => {
    const clientId = randomId();
    const client = { ws };
    clients[clientId] = client;

    ws.on("message", msg => {
        msg = JSON.parse(msg);
        if (msg.type === "join") {
            const puzzle = getPuzzle(msg.puzzleId);
            if (puzzle === undefined) {
                return;
            }
            if (client.puzzleId !== undefined) {
                puzzles[client.puzzleId].clients.delete(clientId);
            }
            client.puzzleId = msg.puzzleId;
            client.index = 0;
            while ([...puzzle.clients].some(otherId => clients[otherId].index === client.index)) {
                client.index += 1;
            }
            puzzle.clients.add(clientId);
            ws.send(
                JSON.stringify({
                    type: "sync",
                    puzzleId: msg.puzzleId,
                    url: puzzle.pu.maketext().replace("about:blank", "http://x/penpa-edit/"),
                })
            );
            return;
        }

        const puzzle = puzzles[client.puzzleId];
        if (msg.type === "update") {
            pu = puzzle.pu;
            applyAction(msg.update.action);
            puzzle.pu = pu;
            puzzle.clients.forEach(otherId => {
                if (clients[otherId].ws.readyState === WebSocket.OPEN) {
                    clients[otherId].ws.send(JSON.stringify(msg));
                }
            });
        } else if (msg.type === "cursor") {
            puzzle.clients.forEach(otherId => {
                if (clients[otherId].ws.readyState === WebSocket.OPEN && otherId !== clientId) {
                    clients[otherId].ws.send(JSON.stringify({ ...msg, index: client.index }));
                }
            });
        } else {
            console.log("Unknown message from client:", msg);
        }
    });

    ws.on("close", () => {
        const puzzle = puzzles[client.puzzleId];
        if (puzzle !== undefined) {
            puzzle.clients.delete(clientId);
            puzzle.clients.forEach(otherId => {
                if (clients[otherId].ws.readyState === WebSocket.OPEN) {
                    clients[otherId].ws.send(JSON.stringify({ type: "cursor", index: client.index }));
                }
            });
        }
    });
});

// DB
function getPuzzle(puzzleId) {
    if (puzzles[puzzleId] !== undefined) {
        return puzzles[puzzleId];
    }
    if (/[a-z0-9]+/.test(puzzleId) && fs.existsSync(`data/${puzzleId}`)) {
        const saved = JSON.parse(fs.readFileSync(`data/${puzzleId}`));
        create_newboard();
        import_url(saved.url);
        return (puzzles[puzzleId] = {
            pu,
            name: saved.name,
            clients: new Set(),
        });
    }
}
function persistPuzzles() {
    for (const [puzzleId, puzzle] of Object.entries(puzzles)) {
        const url = puzzle.pu.maketext().replace("about:blank", "http://x/penpa-edit/");
        fs.writeFileSync(`data/${puzzleId}`, JSON.stringify({ url, name: puzzle.name }));
    }
}
setInterval(persistPuzzles, 1000 * 60 * 60);
process.on("SIGINT", () => {
    persistPuzzles();
    process.exit();
});

app.listen(8080, () => console.log("Starting server"));
