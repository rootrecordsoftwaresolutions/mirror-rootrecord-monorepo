package com.rootrecord.blocknotes.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

private fun SupportSQLiteDatabase.tableExists(table: String): Boolean {
    query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        arrayOf(table),
    ).use { return it.moveToFirst() }
}

private fun SupportSQLiteDatabase.columnExists(table: String, column: String): Boolean {
    query("PRAGMA table_info(`$table`)").use { cursor ->
        val nameIndex = cursor.getColumnIndex("name")
        if (nameIndex < 0) return false
        while (cursor.moveToNext()) {
            if (cursor.getString(nameIndex) == column) return true
        }
    }
    return false
}

private fun SupportSQLiteDatabase.addColumnIfMissing(table: String, columnDef: String) {
    val columnName = columnDef.trim().split(Regex("\\s+")).first()
    if (!columnExists(table, columnName)) {
        execSQL("ALTER TABLE `$table` ADD COLUMN $columnDef")
    }
}

private fun SupportSQLiteDatabase.ensureAreasSchema() {
    if (!tableExists("areas")) {
        execSQL(
            """
            CREATE TABLE IF NOT EXISTS areas (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                worldId INTEGER NOT NULL,
                label TEXT NOT NULL,
                minX INTEGER NOT NULL,
                minZ INTEGER NOT NULL,
                maxX INTEGER NOT NULL,
                maxZ INTEGER NOT NULL,
                dimension TEXT NOT NULL,
                chunkArea INTEGER NOT NULL DEFAULT 0,
                chunkX INTEGER,
                chunkZ INTEGER,
                timestamp INTEGER NOT NULL,
                sortOrder INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent(),
        )
    }
    execSQL(
        "CREATE UNIQUE INDEX IF NOT EXISTS index_areas_chunk ON areas(worldId, dimension, chunkX, chunkZ) WHERE chunkArea = 1",
    )
    addColumnIfMissing("coordinates", "areaId INTEGER")
    addColumnIfMissing("notes", "waypointId INTEGER")
    addColumnIfMissing("notes", "areaId INTEGER")
}

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.addColumnIfMissing("worlds", "playMode TEXT NOT NULL DEFAULT 'SINGLEPLAYER'")
        db.addColumnIfMissing("worlds", "serverAddress TEXT")
        db.addColumnIfMissing("worlds", "mapUrl TEXT")
    }
}

/** Manual sort order for coords list (drag to reorder). */
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.addColumnIfMissing("coordinates", "sortOrder INTEGER NOT NULL DEFAULT 0")
        db.execSQL(
            """
            UPDATE coordinates SET sortOrder = (
                SELECT COUNT(*) FROM coordinates AS newer
                WHERE newer.worldId = coordinates.worldId
                  AND (newer.timestamp > coordinates.timestamp
                       OR (newer.timestamp = coordinates.timestamp AND newer.id > coordinates.id))
            )
            WHERE sortOrder = 0
            """.trimIndent(),
        )
    }
}

/** Areas table, location note links, waypoint chunk areas. */
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.ensureAreasSchema()
    }
}

/** Repair partial v4 installs (missing areas / note link columns). */
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.ensureAreasSchema()
    }
}

/** Rebuild search index after note schema changes. */
val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.ensureAreasSchema()
        if (db.tableExists("notes_fts")) {
            runCatching {
                db.execSQL("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')")
            }
        }
    }
}
