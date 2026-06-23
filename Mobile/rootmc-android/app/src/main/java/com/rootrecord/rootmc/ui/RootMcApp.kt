package com.rootrecord.rootmc.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.rootrecord.rootmc.R
import com.rootrecord.rootmc.ui.auth.AuthScreen
import com.rootrecord.rootmc.ui.build.BuildPlannerScreen
import com.rootrecord.rootmc.ui.components.AdMobBanner
import com.rootrecord.rootmc.ui.feedback.FeedbackScreen
import com.rootrecord.rootmc.ui.gallery.GalleryScreen
import com.rootrecord.rootmc.ui.chambers.ChamberDetailScreen
import com.rootrecord.rootmc.ui.locations.AreaDetailScreen
import com.rootrecord.rootmc.ui.locations.LocationsHubScreen
import com.rootrecord.rootmc.ui.locations.WaypointDetailScreen
import com.rootrecord.rootmc.ui.more.MoreScreen
import com.rootrecord.rootmc.ui.navigation.RootMcNavRoutes
import com.rootrecord.rootmc.ui.realm.GroupChatScreen
import com.rootrecord.rootmc.ui.realm.RealmSocialScreen
import com.rootrecord.rootmc.ui.server.RootMcServerScreen
import com.rootrecord.rootmc.ui.server.StockMarketScreen
import com.rootrecord.rootmc.ui.server.ShopAlertsScreen
import com.rootrecord.rootmc.ui.server.MayorDashboardScreen
import com.rootrecord.rootmc.ui.server.VaultScreen
import com.rootrecord.rootmc.ui.reference.ReferenceCategoryScreen
import com.rootrecord.rootmc.ui.reference.ReferenceScreen
import com.rootrecord.rootmc.ui.screens.NoteEditorScreen
import com.rootrecord.rootmc.ui.screens.NotebookScreen
import com.rootrecord.rootmc.ui.screens.NotesScreen
import com.rootrecord.rootmc.ui.search.SearchScreen
import com.rootrecord.rootmc.ui.templates.TemplatesScreen
import com.rootrecord.rootmc.ui.timeline.TimelineScreen
import com.rootrecord.rootmc.ui.trash.TrashScreen
import com.rootrecord.rootmc.ui.server.ServerAiReportScreen
import com.rootrecord.rootmc.ui.worlds.WorldAiReportScreen
import com.rootrecord.rootmc.ui.worlds.WorldDetailScreen
import com.rootrecord.rootmc.ui.worlds.WorldMapScreen
import com.rootrecord.rootmc.ui.upsell.UpsellEvents
import com.rootrecord.rootmc.ui.worlds.WorldsScreen
import kotlinx.coroutines.launch

private data class BottomTab(
    val route: String,
    val labelRes: Int,
    val icon: ImageVector,
)

private val bottomTabs = listOf(
    BottomTab(RootMcNavRoutes.SERVER, R.string.nav_rootmc, Icons.Default.Cloud),
    BottomTab(RootMcNavRoutes.NOTES, R.string.nav_notes, Icons.Default.Book),
    BottomTab(RootMcNavRoutes.WAYPOINTS, R.string.nav_waypoints, Icons.Default.Place),
    BottomTab(RootMcNavRoutes.REFERENCE, R.string.nav_reference, Icons.Default.GridOn),
    BottomTab(RootMcNavRoutes.WORLDS, R.string.nav_worlds, Icons.Default.Public),
    BottomTab(RootMcNavRoutes.MORE, R.string.nav_more, Icons.Default.MoreHoriz),
)

private val bottomNavRoutes = bottomTabs.map { it.route }.toSet()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootMcApp(
    openCoordAddOnLaunch: Boolean = false,
    onOpenCoordAddConsumed: () -> Unit = {},
    showBannerAds: Boolean = false,
    onRecordAdAction: () -> Unit = {},
) {
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val openSignIn by UpsellEvents.openSignIn.collectAsState()
    val navBackStackEntry = navController.currentBackStackEntryAsState().value
    val currentRoute = navBackStackEntry?.destination?.route
    val onNotesTab = currentRoute == RootMcNavRoutes.NOTES
    val showBottomBar = currentRoute in bottomNavRoutes
    var lastAdActionRoute by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(currentRoute) {
        if (currentRoute != null && currentRoute != lastAdActionRoute) {
            if (lastAdActionRoute != null) {
                onRecordAdAction()
            }
            lastAdActionRoute = currentRoute
        }
    }

    LaunchedEffect(openCoordAddOnLaunch) {
        if (openCoordAddOnLaunch) {
            navController.navigate(RootMcNavRoutes.WAYPOINTS) {
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = false
            }
            navController.navigate(RootMcNavRoutes.WAYPOINT_ADD) {
                launchSingleTop = true
            }
            onOpenCoordAddConsumed()
        }
    }

    LaunchedEffect(openSignIn) {
        if (openSignIn) {
            navController.navigate(RootMcNavRoutes.AUTH)
            UpsellEvents.consumeSignInNavigation()
        }
    }

    val navigateTopLevel: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = false
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = onNotesTab,
        drawerContent = {
            ModalDrawerSheet {
                Text(
                    stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(16.dp),
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_search)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(RootMcNavRoutes.SEARCH)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_gallery)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(RootMcNavRoutes.GALLERY)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_templates)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(RootMcNavRoutes.TEMPLATES)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_trash)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(RootMcNavRoutes.TRASH)
                    },
                )
            }
        },
    ) {
        Scaffold(
            contentWindowInsets = WindowInsets.safeDrawing.only(
                WindowInsetsSides.Horizontal + WindowInsetsSides.Top,
            ),
            topBar = {
                if (onNotesTab) {
                    TopAppBar(
                        title = { Text(stringResource(R.string.nav_notes)) },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Default.Menu, contentDescription = "Menu")
                            }
                        },
                    )
                }
            },
            bottomBar = {
                if (showBottomBar) {
                    Column(Modifier.fillMaxWidth()) {
                        if (showBannerAds) {
                            AdMobBanner()
                        }
                        NavigationBar {
                            val hierarchy = navBackStackEntry?.destination?.hierarchy
                            bottomTabs.forEach { tab ->
                                val selected = hierarchy?.any { it.route == tab.route } == true
                                NavigationBarItem(
                                    icon = {
                                        Icon(tab.icon, contentDescription = stringResource(tab.labelRes))
                                    },
                                    label = { Text(stringResource(tab.labelRes)) },
                                    selected = selected,
                                    onClick = { navigateTopLevel(tab.route) },
                                )
                            }
                        }
                    }
                }
            },
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = RootMcNavRoutes.SERVER,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                composable(RootMcNavRoutes.NOTES) {
                    NotesScreen(
                        onOpenNotebook = { id ->
                            navController.navigate(RootMcNavRoutes.notebook(id))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.NOTEBOOK,
                    arguments = listOf(navArgument("notebookId") { type = NavType.LongType }),
                ) {
                    NotebookScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                        onNewNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.NOTE_EDITOR,
                    arguments = listOf(navArgument("noteId") { type = NavType.LongType }),
                ) {
                    NoteEditorScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId)) {
                                launchSingleTop = true
                            }
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.NOTE_NEW,
                    arguments = listOf(navArgument("notebookId") { type = NavType.LongType }),
                ) {
                    NoteEditorScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId)) {
                                launchSingleTop = true
                            }
                        },
                    )
                }
                composable(RootMcNavRoutes.WAYPOINTS) {
                    LocationsHubScreen(
                        onOpenWaypoint = { id ->
                            navController.navigate(RootMcNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(RootMcNavRoutes.area(id))
                        },
                        onOpenChamber = { id ->
                            navController.navigate(RootMcNavRoutes.chamber(id))
                        },
                    )
                }
                composable(RootMcNavRoutes.COORDS) {
                    LocationsHubScreen(
                        onOpenWaypoint = { id ->
                            navController.navigate(RootMcNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(RootMcNavRoutes.area(id))
                        },
                        onOpenChamber = { id ->
                            navController.navigate(RootMcNavRoutes.chamber(id))
                        },
                    )
                }
                composable(RootMcNavRoutes.WAYPOINT_ADD) {
                    LocationsHubScreen(
                        openAddWaypointOnLaunch = true,
                        onOpenWaypoint = { id ->
                            navController.navigate(RootMcNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(RootMcNavRoutes.area(id))
                        },
                        onOpenChamber = { id ->
                            navController.navigate(RootMcNavRoutes.chamber(id))
                        },
                    )
                }
                composable(RootMcNavRoutes.COORD_ADD) {
                    LocationsHubScreen(
                        openAddWaypointOnLaunch = true,
                        onOpenWaypoint = { id ->
                            navController.navigate(RootMcNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(RootMcNavRoutes.area(id))
                        },
                        onOpenChamber = { id ->
                            navController.navigate(RootMcNavRoutes.chamber(id))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.WAYPOINT_DETAIL,
                    arguments = listOf(navArgument("waypointId") { type = NavType.LongType }),
                ) {
                    WaypointDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.AREA_DETAIL,
                    arguments = listOf(navArgument("areaId") { type = NavType.LongType }),
                ) {
                    AreaDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.CHAMBER_DETAIL,
                    arguments = listOf(navArgument("chamberId") { type = NavType.LongType }),
                ) {
                    ChamberDetailScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.REFERENCE) {
                    ReferenceScreen(
                        onOpenCategory = { category ->
                            navController.navigate(RootMcNavRoutes.referenceCategory(category))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.REF_CATEGORY,
                    arguments = listOf(navArgument("category") { type = NavType.StringType }),
                ) { entry ->
                    val category = entry.arguments?.getString("category") ?: return@composable
                    ReferenceCategoryScreen(
                        category = category,
                        onBack = { navController.popBackStack() },
                        viewModel = hiltViewModel(entry),
                    )
                }
                composable(RootMcNavRoutes.WORLDS) {
                    WorldsScreen(
                        onOpenWorld = { worldId ->
                            navController.navigate(RootMcNavRoutes.world(worldId))
                        },
                    )
                }
                composable(RootMcNavRoutes.SERVER) {
                    RootMcServerScreen(
                        onAuth = { navController.navigate(RootMcNavRoutes.AUTH) },
                        onOpenWorlds = { navigateTopLevel(RootMcNavRoutes.WORLDS) },
                        onOpenRealm = { navController.navigate(RootMcNavRoutes.REALM) },
                        onOpenStockMarket = { navController.navigate(RootMcNavRoutes.SERVER_STOCK_MARKET) },
                        onOpenVault = { navController.navigate(RootMcNavRoutes.SERVER_VAULT) },
                        onOpenShopAlerts = { navController.navigate(RootMcNavRoutes.SERVER_SHOP_ALERTS) },
                        onOpenMayorDashboard = { navController.navigate(RootMcNavRoutes.SERVER_MAYOR_DASHBOARD) },
                        onOpenAiReport = { serverId, serverName, serverAddress ->
                            navController.navigate(
                                RootMcNavRoutes.serverAiReport(serverId, serverName, serverAddress),
                            )
                        },
                    )
                }
                composable(RootMcNavRoutes.SERVER_STOCK_MARKET) {
                    StockMarketScreen(
                        onBack = { navController.popBackStack() },
                        onOpenVault = { navController.navigate(RootMcNavRoutes.SERVER_VAULT) },
                        onOpenShopAlerts = { navController.navigate(RootMcNavRoutes.SERVER_SHOP_ALERTS) },
                    )
                }
                composable(RootMcNavRoutes.SERVER_VAULT) {
                    VaultScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.SERVER_SHOP_ALERTS) {
                    ShopAlertsScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.SERVER_MAYOR_DASHBOARD) {
                    MayorDashboardScreen(onBack = { navController.popBackStack() })
                }
                composable(
                    RootMcNavRoutes.SERVER_DETAIL,
                    arguments = listOf(navArgument("serverId") { type = NavType.StringType }),
                ) {
                    RootMcServerScreen(
                        onAuth = { navController.navigate(RootMcNavRoutes.AUTH) },
                        onOpenWorlds = { navigateTopLevel(RootMcNavRoutes.WORLDS) },
                        onOpenRealm = { navController.navigate(RootMcNavRoutes.REALM) },
                        onOpenStockMarket = { navController.navigate(RootMcNavRoutes.SERVER_STOCK_MARKET) },
                        onOpenVault = { navController.navigate(RootMcNavRoutes.SERVER_VAULT) },
                        onOpenShopAlerts = { navController.navigate(RootMcNavRoutes.SERVER_SHOP_ALERTS) },
                        onOpenMayorDashboard = { navController.navigate(RootMcNavRoutes.SERVER_MAYOR_DASHBOARD) },
                        onBack = { navController.popBackStack() },
                        onOpenAiReport = { serverId, serverName, serverAddress ->
                            navController.navigate(
                                RootMcNavRoutes.serverAiReport(serverId, serverName, serverAddress),
                            )
                        },
                    )
                }
                composable(
                    route = RootMcNavRoutes.SERVER_AI_REPORT,
                    arguments = listOf(
                        navArgument("serverId") { type = NavType.StringType },
                        navArgument("serverName") {
                            type = NavType.StringType
                            defaultValue = ""
                        },
                        navArgument("serverAddress") {
                            type = NavType.StringType
                            defaultValue = ""
                        },
                    ),
                ) {
                    ServerAiReportScreen(onBack = { navController.popBackStack() })
                }
                composable(
                    RootMcNavRoutes.WORLD_DETAIL,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) { entry ->
                    val worldId = entry.arguments?.getLong("worldId") ?: return@composable
                    WorldDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenAiReport = {
                            navController.navigate(RootMcNavRoutes.worldAiReport(worldId))
                        },
                        onOpenMap = {
                            navController.navigate(RootMcNavRoutes.worldMap(worldId))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.WORLD_MAP,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) {
                    WorldMapScreen(onBack = { navController.popBackStack() })
                }
                composable(
                    RootMcNavRoutes.WORLD_AI_REPORT,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) {
                    WorldAiReportScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.REALM) {
                    RealmSocialScreen(
                        onBack = { navController.popBackStack() },
                        onOpenGroup = { groupId, groupName ->
                            navController.navigate(RootMcNavRoutes.realmGroup(groupId, groupName))
                        },
                    )
                }
                composable(
                    RootMcNavRoutes.REALM_GROUP,
                    arguments = listOf(
                        navArgument("groupId") { type = NavType.StringType },
                        navArgument("groupName") { type = NavType.StringType },
                    ),
                ) { entry ->
                    val groupId = entry.arguments?.getString("groupId") ?: return@composable
                    val groupName = entry.arguments?.getString("groupName")?.replace('_', ' ') ?: "Group"
                    GroupChatScreen(
                        groupName = groupName,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(RootMcNavRoutes.MORE) {
                    MoreScreen(
                        onFeedback = { navController.navigate(RootMcNavRoutes.FEEDBACK) },
                        onAuth = { navController.navigate(RootMcNavRoutes.AUTH) },
                        onBuildPlanner = { navController.navigate(RootMcNavRoutes.BUILD_PLANNER) },
                        onTimeline = { navController.navigate(RootMcNavRoutes.TIMELINE) },
                        onRealm = { navController.navigate(RootMcNavRoutes.REALM) },
                    )
                }
                composable(RootMcNavRoutes.FEEDBACK) {
                    FeedbackScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.AUTH) {
                    AuthScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.SEARCH) {
                    SearchScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                    )
                }
                composable(RootMcNavRoutes.GALLERY) {
                    GalleryScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.TRASH) {
                    TrashScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.TEMPLATES) {
                    TemplatesScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(RootMcNavRoutes.note(noteId))
                        },
                    )
                }
                composable(RootMcNavRoutes.BUILD_PLANNER) {
                    BuildPlannerScreen(onBack = { navController.popBackStack() })
                }
                composable(RootMcNavRoutes.TIMELINE) {
                    TimelineScreen(onBack = { navController.popBackStack() })
                }
            }
        }
    }
}
