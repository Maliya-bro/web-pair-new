let latestSessionId = "";

export function setSessionId(id) {
    latestSessionId = id || "";
}

export function getSessionId() {
    return latestSessionId;
}
