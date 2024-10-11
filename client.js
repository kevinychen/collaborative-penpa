const ws = new WebSocket("ws://" + location.host + "/ws");

ws.addEventListener("open", event => {
    console.log("Connected to WebSocket server");
});

ws.addEventListener("message", event => {
    console.log("Message from server:", event.data);
});

document.addEventListener("click", () => {
    const message = "Hello from client!";
    console.log("Sending:", message);
    ws.send(message);
});
