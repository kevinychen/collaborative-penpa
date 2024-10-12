const ws = new WebSocket("ws://" + location.host + "/ws");

const randomId = () => (1 + Math.random()).toString(36).substring(2);

let puzzleId = "KYC";
const localChanges = [];

ws.addEventListener("open", () => {
    console.log("Connected to WebSocket server");
});

ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    if (msg.operation === 'sync') {
        import_url(msg.url);
    } else {
        console.log("Unknown message from server:", msg);
    }
});

window.addEventListener("load", () => {
    ws.send(JSON.stringify({
        operation: "join",
        puzzleId,
    }));
    // const oldCreateNewboard = create_newboard;
    // create_newboard = function () {
    //     const change = {
    //         id: randomId(),
    //         operation: 'create_newboard',
    //         size: UserSettings.displaysize,
    //         mode: pu.mode,
    //         gridtype: UserSettings.gridtype,
    //     };
    //     localChanges
    //     ws.send(

    //     })
    //     oldCreateNewboard();
    // };
});

// document.addEventListener("click", () => {
//     const message = "Hello from client!";
//     console.log("Sending:", message);
//     ws.send(message);
// });
