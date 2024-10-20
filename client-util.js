const SECOND = 1000;
const MINUTE = 60 * SECOND;

// https://sashamaps.net/docs/resources/20-colors/
// prettier-ignore
const COLORS = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
    "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe",
    "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000",
    "#aaffc3", "#808000", "#ffd8b1", "#000075", "#808080",
];

function invertAction(action) {
    if (action.type === "command") {
        for (const command of action.commands) {
            pu[action.mode].command_undo.push(command.undo);
            pu[action.mode + "_col"].command_undo.push(command.undo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = action.mode;
        pu.undo();
        pu.mode.qa = currentMode;
        const commands = [];
        for (const command of action.commands) {
            commands.push({
                redo: pu[action.mode].command_redo.pop(),
                redo_col: pu[action.mode + "_col"].command_redo.pop(),
                undo: command.undo,
                undo_col: command.undo_col,
            });
        }
        return {
            type: "command-undo",
            mode: action.mode,
            commands,
        };
    } else if (action.type === "command-undo") {
        for (const command of action.commands.toReversed()) {
            pu[action.mode].command_redo.push(command.redo);
            pu[action.mode + "_col"].command_redo.push(command.redo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = action.mode;
        pu.redo();
        pu.mode.qa = currentMode;
        const commands = [];
        for (const command of action.commands.toReversed()) {
            commands.push({
                undo: pu[action.mode].command_undo.pop(),
                undo_col: pu[action.mode + "_col"].command_undo.pop(),
                redo: command.redo,
                redo_col: command.redo_col,
            });
        }
        return {
            type: "command",
            mode: action.mode,
            commands,
        };
    } else if (action.type === "overwrite") {
        return {
            type: "overwrite",
            url: action.prevUrl,
            prevUrl: pu.maketext(),
        };
    }
}

function addToLocalStorage(puzzleId) {
    const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
    if (!puzzleIds.includes(puzzleId)) {
        window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
    }
}

function makeCursor(index) {
    const cursorWrapper = document.createElement("div");
    cursorWrapper.innerHTML = `
    <svg class="cursor" width="100" height="100" viewBox="0 0 100 100" fill="${COLORS[index]}">
        <polygon points="0,100 29,71 71,71 0,0"></polygon>
    </svg>`.trim();
    return cursorWrapper.firstChild;
}

function assert(value, message = "Internal error") {
    if (!value) {
        throw new Error(message);
    }
}
