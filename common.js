const randomId = () => (1 + Math.random()).toString(36).substring(2);

function applyUpdate(update) {
    if (update.type === "command") {
        for (const command of update.commands.toReversed()) {
            pu[update.mode].command_redo.push(command.redo);
            pu[update.mode + "_col"].command_redo.push(command.redo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = update.mode;
        pu.redo();
        pu.mode.qa = currentMode;
        for (const _ of update.commands) {
            pu[update.mode].command_undo.pop();
            pu[update.mode + "_col"].command_undo.pop();
        }
    } else if (update.type === "command-undo") {
        for (const command of update.commands) {
            pu[update.mode].command_undo.push(command.undo);
            pu[update.mode + "_col"].command_undo.push(command.undo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = update.mode;
        pu.undo();
        pu.mode.qa = currentMode;
        for (const _ of update.commands) {
            pu[update.mode].command_redo.pop();
            pu[update.mode + "_col"].command_redo.pop();
        }
    } else if (update.type === "overwrite") {
        import_url(update.url);
    }
}

function invertUpdate(update) {
    if (update.type === "command") {
        for (const command of update.commands) {
            pu[update.mode].command_undo.push(command.undo);
            pu[update.mode + "_col"].command_undo.push(command.undo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = update.mode;
        pu.undo();
        pu.mode.qa = currentMode;
        const commands = [];
        for (const command of update.commands) {
            commands.push({
                redo: pu[update.mode].command_redo.pop(),
                redo_col: pu[update.mode + "_col"].command_redo.pop(),
                undo: command.undo,
                undo_col: command.undo_col,
            });
        }
        return {
            type: "command-undo",
            changeId: randomId(),
            timestamp: Date.now(),
            mode: update.mode,
            commands,
        };
    } else if (update.type === "command-undo") {
        for (const command of update.commands.toReversed()) {
            pu[update.mode].command_redo.push(command.redo);
            pu[update.mode + "_col"].command_redo.push(command.redo_col);
        }
        const currentMode = pu.mode.qa;
        pu.mode.qa = update.mode;
        pu.redo();
        pu.mode.qa = currentMode;
        const commands = [];
        for (const command of update.commands.toReversed()) {
            commands.push({
                undo: pu[update.mode].command_undo.pop(),
                undo_col: pu[update.mode + "_col"].command_undo.pop(),
                redo: command.redo,
                redo_col: command.redo_col,
            });
        }
        return {
            type: "command",
            changeId: randomId(),
            timestamp: Date.now(),
            mode: update.mode,
            commands,
        };
    } else if (update.type === "overwrite") {
        return {
            type: "overwrite",
            changeId: randomId(),
            timestamp: Date.now(),
            url: update.prevUrl,
            prevUrl: pu.maketext(),
        };
    }
}
