const MINUTE = 60000;
const WEIGHT_LIMIT = 1000000;

const weight = item => item.url.length;
const history = JSON.parse(window.localStorage.getItem("history")) || {};
const numLocalEdits = {};

function saveHistory(puzzleId) {
    if (numLocalEdits[puzzleId] === undefined) {
        numLocalEdits[puzzleId] = 0;
    }
    numLocalEdits[puzzleId]++;

    if (history[puzzleId] === undefined) {
        history[puzzleId] = [];
    }
    const puzzleHistory = history[puzzleId];

    if (puzzleHistory[puzzleHistory.length - 1]?.timestamp > Date.now() - 1 * MINUTE) {
        return;
    }

    puzzleHistory.push({
        timestamp: Date.now(),
        url: pu.maketext(),
        numEdits: numLocalEdits[puzzleId],
    });
    numLocalEdits[puzzleId] = 0;

    pruneHistory();

    window.localStorage.setItem("history", JSON.stringify(history));
}

function pruneHistory() {
    // If there are no memory constraints, keep the most recent 30 records, and 15 min intervals
    // after that
    for (const puzzleHistory of Object.values(history)) {
        for (let i = 1; i < puzzleHistory.length; i++) {
            const timestamp = puzzleHistory[i].timestamp;
            const prevTimestamp = puzzleHistory[i - 1].timestamp;
            if (i < puzzleHistory.length - 30 && prevTimestamp > timestamp - 15 * MINUTE) {
                puzzleHistory.splice(i, 1);
                i--;
            }
        }
    }

    let totalWeight = 0;
    for (const puzzleHistory of Object.values(history)) {
        totalWeight += puzzleHistory.map(weight).reduce((a, b) => a + b, 0);
    }
    if (totalWeight <= WEIGHT_LIMIT) {
        return;
    }

    // Remove history items of "low importance", i.e. small # of edits since the previous edit,
    // or old records.
    const itemImportance = [];
    for (const [puzzleId, puzzleHistory] of Object.entries(history)) {
        const age = Date.now() - puzzleHistory[puzzleHistory.length - 1].timestamp;
        for (const item of puzzleHistory) {
            itemImportance.push([-item.numEdits / age, puzzleId, item]);
        }
    }
    itemImportance.sort();
    for (const [_, puzzleId, item] of itemImportance) {
        history[puzzleId].splice(history[puzzleId].indexOf(item), 1);
        totalWeight -= weight(item);
        if (history[puzzleId].length === 0) {
            delete history[puzzleId];
        }
        if (totalWeight < WEIGHT_LIMIT / 2) {
            break;
        }
    }
}
