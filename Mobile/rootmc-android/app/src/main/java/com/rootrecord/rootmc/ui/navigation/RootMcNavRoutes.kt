package com.rootrecord.rootmc.ui.navigation

object RootMcNavRoutes {
    const val NOTES = "notes"
    const val NOTEBOOK = "notebook/{notebookId}"
    const val NOTE_EDITOR = "note/{noteId}"
    const val NOTE_NEW = "note/new/{notebookId}"
    const val WAYPOINTS = "waypoints"
    /** @deprecated use [WAYPOINTS]; kept for deep links */
    const val COORDS = "coords"
    const val WAYPOINT_ADD = "waypoint/add"
    const val COORD_ADD = "coord/add"
    const val WAYPOINT_DETAIL = "waypoint/{waypointId}"
    const val COORD_DETAIL = "coord/{coordId}"
    const val CHAMBER_DETAIL = "chamber/{chamberId}"
    const val REFERENCE = "reference"
    const val REF_CATEGORY = "reference/{category}"
    const val WORLDS = "worlds"
    const val SERVER = "server"
    const val SERVER_STOCK_MARKET = "server/stock-market"
    const val SERVER_VAULT = "server/vault"
    const val SERVER_SHOP_ALERTS = "server/shop-alerts"
    const val SERVER_MAYOR_DASHBOARD = "server/mayor-dashboard"
    const val SERVER_DETAIL = "server/{serverId}"
    const val SERVER_AI_REPORT = "server/{serverId}/ai-report?serverName={serverName}&serverAddress={serverAddress}"
    const val WORLD_DETAIL = "world/{worldId}"
    const val WORLD_MAP = "world/{worldId}/map"
    const val WORLD_AI_REPORT = "world/{worldId}/ai-report"
    const val REALM = "realm"
    const val REALM_GROUP = "realm/group/{groupId}/{groupName}"
    const val MORE = "more"
    const val SETTINGS = "settings"
    const val FEEDBACK = "feedback"
    const val AUTH = "auth"
    const val SEARCH = "search"
    const val GALLERY = "gallery"
    const val TRASH = "trash"
    const val TEMPLATES = "templates"
    const val BUILD_PLANNER = "build_planner"
    const val TIMELINE = "timeline"

    fun notebook(notebookId: Long) = "notebook/$notebookId"
    fun note(noteId: Long) = "note/$noteId"
    fun newNote(notebookId: Long) = "note/new/$notebookId"
    fun waypoint(waypointId: Long) = "waypoint/$waypointId"
    fun coord(coordId: Long) = "coord/$coordId"
    fun area(areaId: Long) = "area/$areaId"
    fun chamber(chamberId: Long) = "chamber/$chamberId"
    fun referenceCategory(category: String) = "reference/$category"
    fun world(worldId: Long) = "world/$worldId"
    fun worldMap(worldId: Long) = "world/$worldId/map"
    fun worldAiReport(worldId: Long) = "world/$worldId/ai-report"
    fun serverDetail(serverId: String) = "server/$serverId"
    fun serverAiReport(serverId: String, serverName: String, serverAddress: String): String {
        val enc = java.net.URLEncoder::encode
        return "server/${enc(serverId, Charsets.UTF_8.name())}/ai-report" +
            "?serverName=${enc(serverName, Charsets.UTF_8.name())}" +
            "&serverAddress=${enc(serverAddress, Charsets.UTF_8.name())}"
    }
    fun realmGroup(groupId: String, groupName: String) =
        "realm/group/$groupId/${groupName.replace("/", "_")}"
}
