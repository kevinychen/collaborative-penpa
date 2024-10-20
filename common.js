const randomId = () => (1 + Math.random()).toString(36).substring(2);

function applyAction(action) {
    if (action.type === "command") {
        for (const command of action.commands.toReversed()) {
            pu[action.mode].command_redo.push(command.redo);
            pu[action.mode + "_col"].command_redo.push(command.redo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = action.mode;
        pu.redo();
        pu.mode.qa = currentMode;
        for (const _ of action.commands) {
            pu[action.mode].command_undo.pop();
            pu[action.mode + "_col"].command_undo.pop();
        }
    } else if (action.type === "command-undo") {
        for (const command of action.commands) {
            pu[action.mode].command_undo.push(command.undo);
            pu[action.mode + "_col"].command_undo.push(command.undo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = action.mode;
        pu.undo();
        pu.mode.qa = currentMode;
        for (const _ of action.commands) {
            pu[action.mode].command_redo.pop();
            pu[action.mode + "_col"].command_redo.pop();
        }
    } else if (action.type === "overwrite") {
        import_url(action.url);
    }
}
