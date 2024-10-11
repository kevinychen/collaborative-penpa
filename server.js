// boot();

// pu.mouse_mode = "down_left";
// pu.mouse_click = 0;
// pu.mouse_click_last = 1;
// pu.mouseevent(38, 38, 30);

// console.log(pu.pu_q.surface);

const app = express();
expressWs(app);
app.get("/", (_, res) => res.redirect("/penpa-edit/docs/index.html"));
app.get("/penpa-edit/docs/index.html", (_, res) => {
    res.type("html");
    res.send(modifiedClientHtml);
});
app.use("/penpa-edit", express.static("penpa-edit"));
app.ws("/ws", ws => {
    ws.on("message", msg => ws.send(msg));
});
app.listen(5000, () => console.log("Starting server"));
