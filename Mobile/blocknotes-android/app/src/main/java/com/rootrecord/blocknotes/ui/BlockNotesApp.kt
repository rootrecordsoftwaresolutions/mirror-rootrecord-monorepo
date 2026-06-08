package com.rootrecord.blocknotes.ui

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
import com.rootrecord.blocknotes.R
import com.rootrecord.blocknotes.ui.auth.AuthScreen
import com.rootrecord.blocknotes.ui.build.BuildPlannerScreen
import com.rootrecord.blocknotes.ui.components.AdMobBanner
import com.rootrecord.blocknotes.ui.feedback.FeedbackScreen
import com.rootrecord.blocknotes.ui.gallery.GalleryScreen
import com.rootrecord.blocknotes.ui.locations.AreaDetailScreen
import com.rootrecord.blocknotes.ui.locations.LocationsHubScreen
import com.rootrecord.blocknotes.ui.locations.WaypointDetailScreen
import com.rootrecord.blocknotes.ui.more.MoreScreen
import com.rootrecord.blocknotes.ui.navigation.BlockNotesNavRoutes
import com.rootrecord.blocknotes.ui.realm.GroupChatScreen
import com.rootrecord.blocknotes.ui.realm.RealmSocialScreen
import com.rootrecord.blocknotes.ui.server.FeaturedServerDetailScreen
import com.rootrecord.blocknotes.ui.server.FeaturedServersScreen
import com.rootrecord.blocknotes.ui.reference.ReferenceCategoryScreen
import com.rootrecord.blocknotes.ui.reference.ReferenceScreen
import com.rootrecord.blocknotes.ui.screens.NoteEditorScreen
import com.rootrecord.blocknotes.ui.screens.NotebookScreen
import com.rootrecord.blocknotes.ui.screens.NotesScreen
import com.rootrecord.blocknotes.ui.search.SearchScreen
import com.rootrecord.blocknotes.ui.templates.TemplatesScreen
import com.rootrecord.blocknotes.ui.timeline.TimelineScreen
import com.rootrecord.blocknotes.ui.trash.TrashScreen
import com.rootrecord.blocknotes.ui.worlds.WorldAiReportScreen
import com.rootrecord.blocknotes.ui.worlds.WorldDetailScreen
import com.rootrecord.blocknotes.ui.worlds.WorldMapScreen
import com.rootrecord.blocknotes.ui.upsell.UpsellEvents
import com.rootrecord.blocknotes.ui.worlds.WorldsScreen
import kotlinx.coroutines.launch

private data class BottomTab(
    val route: String,
    val labelRes: Int,
    val icon: ImageVector,
)

private val bottomTabs = listOf(
    BottomTab(BlockNotesNavRoutes.NOTES, R.string.nav_notes, Icons.Default.Book),
    BottomTab(BlockNotesNavRoutes.WAYPOINTS, R.string.nav_waypoints, Icons.Default.Place),
    BottomTab(BlockNotesNavRoutes.REFERENCE, R.string.nav_reference, Icons.Default.GridOn),
    BottomTab(BlockNotesNavRoutes.WORLDS, R.string.nav_worlds, Icons.Default.Public),
    BottomTab(BlockNotesNavRoutes.SERVER, R.string.nav_featured_servers, Icons.Default.Cloud),
    BottomTab(BlockNotesNavRoutes.MORE, R.string.nav_more, Icons.Default.MoreHoriz),
)

private val bottomNavRoutes = bottomTabs.map { it.route }.toSet()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlockNotesApp(
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
    val onNotesTab = currentRoute == BlockNotesNavRoutes.NOTES
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
            navController.navigate(BlockNotesNavRoutes.WAYPOINTS) {
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = false
            }
            navController.navigate(BlockNotesNavRoutes.WAYPOINT_ADD) {
                launchSingleTop = true
            }
            onOpenCoordAddConsumed()
        }
    }

    LaunchedEffect(openSignIn) {
        if (openSignIn) {
            navController.navigate(BlockNotesNavRoutes.AUTH)
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
                        navController.navigate(BlockNotesNavRoutes.SEARCH)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_gallery)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(BlockNotesNavRoutes.GALLERY)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_templates)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(BlockNotesNavRoutes.TEMPLATES)
                    },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_trash)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(BlockNotesNavRoutes.TRASH)
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
                startDestination = BlockNotesNavRoutes.NOTES,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                composable(BlockNotesNavRoutes.NOTES) {
                    NotesScreen(
                        onOpenNotebook = { id ->
                            navController.navigate(BlockNotesNavRoutes.notebook(id))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.NOTEBOOK,
                    arguments = listOf(navArgument("notebookId") { type = NavType.LongType }),
                ) {
                    NotebookScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                        onNewNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.NOTE_EDITOR,
                    arguments = listOf(navArgument("noteId") { type = NavType.LongType }),
                ) {
                    NoteEditorScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId)) {
                                launchSingleTop = true
                            }
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.NOTE_NEW,
                    arguments = listOf(navArgument("notebookId") { type = NavType.LongType }),
                ) {
                    NoteEditorScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId)) {
                                launchSingleTop = true
                            }
                        },
                    )
                }
                composable(BlockNotesNavRoutes.WAYPOINTS) {
                    LocationsHubScreen(
                        onOpenWaypoint = { id ->
                            navController.navigate(BlockNotesNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(BlockNotesNavRoutes.area(id))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.COORDS) {
                    LocationsHubScreen(
                        onOpenWaypoint = { id ->
                            navController.navigate(BlockNotesNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(BlockNotesNavRoutes.area(id))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.WAYPOINT_ADD) {
                    LocationsHubScreen(
                        openAddWaypointOnLaunch = true,
                        onOpenWaypoint = { id ->
                            navController.navigate(BlockNotesNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(BlockNotesNavRoutes.area(id))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.COORD_ADD) {
                    LocationsHubScreen(
                        openAddWaypointOnLaunch = true,
                        onOpenWaypoint = { id ->
                            navController.navigate(BlockNotesNavRoutes.waypoint(id))
                        },
                        onOpenArea = { id ->
                            navController.navigate(BlockNotesNavRoutes.area(id))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.WAYPOINT_DETAIL,
                    arguments = listOf(navArgument("waypointId") { type = NavType.LongType }),
                ) {
                    WaypointDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.AREA_DETAIL,
                    arguments = listOf(navArgument("areaId") { type = NavType.LongType }),
                ) {
                    AreaDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.REFERENCE) {
                    ReferenceScreen(
                        onOpenCategory = { category ->
                            navController.navigate(BlockNotesNavRoutes.referenceCategory(category))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.REF_CATEGORY,
                    arguments = listOf(navArgument("category") { type = NavType.StringType }),
                ) { entry ->
                    val category = entry.arguments?.getString("category") ?: return@composable
                    ReferenceCategoryScreen(
                        category = category,
                        onBack = { navController.popBackStack() },
                        viewModel = hiltViewModel(entry),
                    )
                }
                composable(BlockNotesNavRoutes.WORLDS) {
                    WorldsScreen(
                        onOpenWorld = { worldId ->
                            navController.navigate(BlockNotesNavRoutes.world(worldId))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.SERVER) {
                    FeaturedServersScreen(
                        onAuth = { navController.navigate(BlockNotesNavRoutes.AUTH) },
                        onOpenServer = { serverId ->
                            navController.navigate(BlockNotesNavRoutes.serverDetail(serverId))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.SERVER_DETAIL,
                    arguments = listOf(navArgument("serverId") { type = NavType.StringType }),
                ) {
                    FeaturedServerDetailScreen(
                        onBack = { navController.popBackStack() },
                        onAuth = { navController.navigate(BlockNotesNavRoutes.AUTH) },
                        onOpenWorlds = { navigateTopLevel(BlockNotesNavRoutes.WORLDS) },
                        onOpenRealm = { navController.navigate(BlockNotesNavRoutes.REALM) },
                    )
                }
                composable(
                    BlockNotesNavRoutes.WORLD_DETAIL,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) { entry ->
                    val worldId = entry.arguments?.getLong("worldId") ?: return@composable
                    WorldDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenAiReport = {
                            navController.navigate(BlockNotesNavRoutes.worldAiReport(worldId))
                        },
                        onOpenMap = {
                            navController.navigate(BlockNotesNavRoutes.worldMap(worldId))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.WORLD_MAP,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) {
                    WorldMapScreen(onBack = { navController.popBackStack() })
                }
                composable(
                    BlockNotesNavRoutes.WORLD_AI_REPORT,
                    arguments = listOf(navArgument("worldId") { type = NavType.LongType }),
                ) {
                    WorldAiReportScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.REALM) {
                    RealmSocialScreen(
                        onBack = { navController.popBackStack() },
                        onOpenGroup = { groupId, groupName ->
                            navController.navigate(BlockNotesNavRoutes.realmGroup(groupId, groupName))
                        },
                    )
                }
                composable(
                    BlockNotesNavRoutes.REALM_GROUP,
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
                composable(BlockNotesNavRoutes.MORE) {
                    MoreScreen(
                        onFeedback = { navController.navigate(BlockNotesNavRoutes.FEEDBACK) },
                        onAuth = { navController.navigate(BlockNotesNavRoutes.AUTH) },
                        onBuildPlanner = { navController.navigate(BlockNotesNavRoutes.BUILD_PLANNER) },
                        onTimeline = { navController.navigate(BlockNotesNavRoutes.TIMELINE) },
                        onRealm = { navController.navigate(BlockNotesNavRoutes.REALM) },
                    )
                }
                composable(BlockNotesNavRoutes.FEEDBACK) {
                    FeedbackScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.AUTH) {
                    AuthScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.SEARCH) {
                    SearchScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.GALLERY) {
                    GalleryScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.TRASH) {
                    TrashScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.TEMPLATES) {
                    TemplatesScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNote = { noteId ->
                            navController.navigate(BlockNotesNavRoutes.note(noteId))
                        },
                    )
                }
                composable(BlockNotesNavRoutes.BUILD_PLANNER) {
                    BuildPlannerScreen(onBack = { navController.popBackStack() })
                }
                composable(BlockNotesNavRoutes.TIMELINE) {
                    TimelineScreen(onBack = { navController.popBackStack() })
                }
            }
        }
    }
}
