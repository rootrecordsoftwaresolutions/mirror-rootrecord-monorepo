package com.rootrecord.minecraft.rootessentials.data;

import com.rootrecord.minecraft.rootessentials.config.RootEssentialsConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public final class MySqlSupport {

    private final String jdbcUrl;
    private final String user;
    private final String password;

    public MySqlSupport(RootEssentialsConfig cfg) {
        this.jdbcUrl = "jdbc:mysql://" + cfg.mysqlHost() + ":" + cfg.mysqlPort() + "/" + cfg.mysqlDatabase() + "?" + cfg.mysqlJdbcParams();
        this.user = cfg.mysqlUsername();
        this.password = cfg.mysqlPassword();
    }

    public Connection open() throws SQLException {
        return DriverManager.getConnection(jdbcUrl, user, password);
    }
}
