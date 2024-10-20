// Global variable that can be temporarily disabled by callers that want to manually call the
// Penpa methods without being intercepted.
let intercepting = true;

const penpaActions = [];
const undoList = [];
const redoList = [];
let prevUrl;

// Intercept the calls that update the Penpa puzzle, such that each action triggers the given
// callback function, with an action argument that is one of the following:
// { type: "command", mode: "pu_?", commands: [{ undo, undo_col, redo, redo_col }] }
// { type: "command-undo", mode: "pu_?", commands: [{ undo, undo_col, redo, redo_col }] }
// { type: "overwrite", prevUrl, url }
function interceptPenpa(callback) {
    const wrappedCallback = action => {
        callback(action);
        penpaActions.length = 0;
        prevUrl = pu.maketext();
    }

    const oldMethod = make_class;
    make_class = function () {
        if (intercepting) {
            penpaActions.push("overwrite");
        }
        const newPu = oldMethod(...arguments);
        return interceptPenpaPuzzle(newPu, wrappedCallback);
    };
}

function resetPenpa(url) {
    import_url(url);
    undoList.length = 0;
    redoList.length = 0;
    prevUrl = url;
}

function interceptPenpaPuzzle(pu, callback) {
    const commandMethods = ["record"];
    for (const method of commandMethods) {
        const oldMethod = pu[method];
        pu[method] = function () {
            if (intercepting) {
                penpaActions.push("command");
            }
            oldMethod.call(pu, ...arguments);
        };
    }

    const overwriteMethods = ["reset", "reset_board", "reset_selectedmode", "point_usecheck"];
    for (const method of overwriteMethods) {
        const oldMethod = pu[method];
        pu[method] = function () {
            if (intercepting) {
                penpaActions.push("overwrite");
            }
            oldMethod.call(pu, ...arguments);
        };
    }

    const oldRedraw = pu.redraw;
    pu.redraw = function () {
        oldRedraw.call(pu, ...arguments);
        if (!intercepting) {
            return;
        }

        intercepting = false;
        if (penpaActions[0] === "command") {
            assert(penpaActions.every(change => change === "command"));
            callback(getCommandAction(penpaActions.length));
        } else if (penpaActions[0] === "overwrite") {
            assert(penpaActions.every(change => change === "overwrite"));
            callback(getOverwriteAction());
        }
        intercepting = true;
    };

    const oldUndo = pu.undo;
    pu.undo = function () {
        if (!intercepting) {
            oldUndo.call(pu, ...arguments);
            return;
        }

        assert(penpaActions.length === 0);
        const prevAction = undoList.pop();
        intercepting = false;
        if (prevAction !== undefined) {
            callback(getUndoAction(prevAction));
        }
        intercepting = true;
    };

    const oldRedo = pu.redo;
    pu.redo = function () {
        if (!intercepting) {
            oldRedo.call(pu, ...arguments);
            return;
        }

        assert(penpaActions.length === 0);
        const prevAction = redoList.pop();
        intercepting = false;
        if (prevAction !== undefined) {
            callback(getRedoAction(prevAction));
        }
        intercepting = true;
    };

    pu.set_redoundocolor = function () {
        document.getElementById("tb_redo").disabled = redoList.length === 0 ? "disabled" : "";
        document.getElementById("tb_undo").disabled = undoList.length === 0 ? "disabled" : "";
    };

    return pu;
}

function getCommandAction(numCommands) {
    const mode = pu.mode.qa;
    const commands = [];
    for (let i = 0; i < numCommands; i++) {
        commands.push({});
    }

    // Store the undo values on the Penpa undo stack
    for (const command of commands.toReversed()) {
        command.undo = pu[mode].command_undo.pop();
        command.undo_col = pu[mode + "_col"].command_undo.pop();
    }
    for (const command of commands) {
        pu[mode].command_undo.push(command.undo);
        pu[mode + "_col"].command_undo.push(command.undo_col);
    }
    pu.undo();

    // Store the redo values on the Penpa redo stack
    for (const command of commands) {
        command.redo = pu[mode].command_redo.pop();
        command.redo_col = pu[mode + "_col"].command_redo.pop();
    }
    for (const command of commands.toReversed()) {
        pu[mode].command_redo.push(command.redo);
        pu[mode + "_col"].command_redo.push(command.redo_col);
    }
    pu.redo();

    const action = {
        type: "command",
        mode,
        commands,
    };
    undoList.push(action);
    redoList.length = 0;
    return action;
}

function getOverwriteAction() {
    const action = {
        type: "overwrite",
        url: pu.maketext(),
        prevUrl,
    };
    undoList.push(action);
    redoList.length = 0;
    return action;
}

function getUndoAction(prevAction) {
    const action = invertAction(prevAction);
    redoList.push(action);
    return action;
}

function getRedoAction(prevAction) {
    const action = invertAction(prevAction);
    undoList.push(action);
    return action;
}
