# Changelog

All notable changes to this project are listed here.

## Unreleased

## 0.1.8 - 2026-11-18

### Added

-   The version number next to the **Crate Works** title.
-   Desktop app: a watchdog. When port 4545 stays quiet for 10 seconds while the app runs (the `node server.js` it opened was stopped, or its own server crashed), the app starts its own server and reloads the page. Before, the dashboard stayed without a server, and the office docks got no drives.

### Changed

-   Office view: the number of armoured cars per office follows the height of its drive pile, one per layer (12 drives), up to 10. A growing pile gets more and more cars and a shrinking one fewer. An office that needs more than five cars gets two cars waiting ahead for each lay-by spot instead of one.

## 0.1.7 - 2026-11-18

### Changed

-   Questions with choices from terminal and desktop sessions are held whenever a dashboard is open, not only while that session's panel is open. A blue **Question for you** alert opens the panel with the form.
-   A held question now waits until you answer it in the dashboard. Closing the panel no longer sends it back to the terminal, and the 280-second limit is gone for questions. It clears without an answer only on Esc in the terminal or when the process ends.
-   `--install-hook` writes a timeout of 86400 seconds (24 hours) for the question hook. Run it again and restart your sessions to get it. `AICO_DASH_UNWATCH_MS` is gone; `AICO_DASH_ASK_HOLD_MS` is new.

### Docs

-   `crossSessionInbound`: what each value does, and why it belongs in `~/.claude/settings.json` (a repository's settings can only make it stricter).
-   Troubleshooting: a question that does not show as a form.

## 0.1.6 - 2026-11-18

### Added

-   **Remote Control** for terminal and desktop sessions. A session with `/rc` on shows **Open in Claude ↗**, which opens its claude.ai link. Without it, the panel says to type `/rc`. A closed session offers **Continue with Remote Control**: a new terminal window runs `claude --resume <id> --remote-control`, and its link opens once it is ready. See [Remote Control](documentation/peer-chat.md#remote-control).
-   **Close session** for terminal and desktop sessions: ends that process, after you confirm.
-   **Dismiss** for closed sessions: hides them from the list and the office until they have new activity.

### Changed

-   A stopped dashboard session counts as closed at once, instead of after 5 quiet minutes.

### Removed

-   **Continue here** (taking over a closed session with `claude --resume` in the dashboard). It clashed with the terminal and with approvals and questions. Use Continue with Remote Control instead. `POST /api/chat/start` no longer takes `resume`.

## 0.1.5 - 2026-11-18

### Fixed

-   Office view: no more crowd of workers by the manager's office after the window was minimised or hidden. Subagents that started and finished while nobody was looking no longer get a figure that has to walk out, and people who finish at their desk while the window is hidden are simply gone when you look again, instead of queueing at the exit.

## 0.1.4 - 2026-11-17

### Added

-   **Continue here**: a terminal or desktop session that is closed there keeps its chat panel. A message reopens it as a dashboard session (`claude --resume`), so messages, approvals and questions go straight through without approving them in the terminal. Refused while the session is still open in a terminal. An ended dashboard session continues the same way. `POST /api/chat/start` takes `{resume, prompt}`. See [Continue here](documentation/peer-chat.md#continue-here).

### Changed

-   Questions with choices (AskUserQuestion) from terminal and desktop sessions now show as a form in the dashboard by default. They are held only while that session's panel is open; otherwise the terminal asks at once, and a waiting question goes back to the terminal 3 seconds after you close the panel. `--no-ask-hook` (or `AICO_DASH_ASK=0`) turns it off. `--ask-hook` and `--with-ask` are no longer needed.
-   `--install-hook` adds the AskUserQuestion hook too (`--no-ask` leaves it out). Run it again if you installed the hook before.

## 0.1.3 - 2026-11-17

### Added

-   **Office view**: a second scene for the same data, with buildings for projects, desk rows for sessions and people for agents. Switch with the Factory / Office buttons or `?view=office`. See [The office view](documentation/office-view.md).
-   Click a person in the office view to see their screen: the chat panel for a main agent, a read-only screen for a subagent.
-   `GET /api/agent/<id>/stream`: read-only event stream for a subagent's screen. Needs the page token.
-   `mode` (`brainstorm`, `cooler` or `null`) on every task in `/api/state`, read from the command or skill name only.
-   Pending subagents in `/api/state`: a subagent shows as soon as the main agent sends it out (`pending: true`, ID `p-…`), and the real subagent carries `dispatch`. The prompt of the call is never included.
-   **Settings** dialog (button beside Usage) with fun elements per view, saved in this browser only: factory breakdowns with the tow truck and repair shop, and office armoured car robberies. Both are on by default and apply without a reload. Scripts read them through `window.CWFun`.
-   Office view: a police station with three patrol cars and a SWAT van. When traffic is stuck, a patrol car parks on the shoulder and the officer waves held vehicles on. See [Traffic police](documentation/office-view.md#traffic-police).
-   Office view: the armoured car robbery scene behind the robbery setting. The bandits' van comes in through the gate, drives to the busiest office street and waits on the shoulder; it then stops a loaded armoured car that passes. Police and SWAT drive over from the station and arrest the bandits, and the drives reach the bank as before. About once every 7 minutes, never with reduced motion. See [Armoured car robberies](documentation/office-view.md#armoured-car-robberies).
-   `window.__office.police()`, `robbery()`, `look()` and `yard()` (vehicles in the bank yard) for tests and debugging.
-   Office view: a **Robbery** button (like Break down in the factory view) starts a robbery now and shows each step. If no loaded armoured car passes the waiting van within 25 seconds, an extra one (without drives) comes in through the gate. It is hidden when the robbery setting is off.
-   Office view: vehicles use turn signals. A vehicle that waits at a roundabout or an out road no longer waits for one that signals it will turn off before it gets there. Two wide vehicles at the same roundabout arm still take turns.
-   Office view: eight shops in an L round the bank's north-east corner, with a one-way car park (14 car and 6 motorcycle spots) and a loading bay, on a new road off the east roundabout (one lane each way). Shoppers walk the pavements to the shops, and visitors come by car or motorcycle, park nose-in, shop and reverse out again. There is also a **Shops and shoppers** setting (on by default), with two sliders: **Shoppers on foot, at most** (0 to 30, 12 by default) and **Shop vehicles, at most** (0 to 20, 20 by default). How many shoppers and visitors there are, and how bright the shop windows are, follows the number of running agents across all offices, never above those sliders. With no agent running there is 1 shopper, a visitor now and then, and dim windows. With 12 or more running there are 12 shoppers and visitors come one after another. `window.CWFun` now also holds numbers (`shopWalkers`, `shopCars`). With the setting off, the shops stay but nobody comes and the windows are dark. With reduced motion, shoppers stand still at the windows and vehicles stand parked. The shop colours are toned down. See [Shops](documentation/office-view.md#shops).
-   Office view: agents drive to work in different vehicles: a sports car, an SUV, a hatchback, a pickup or a motorcycle, in several colours. The kind and colour follow from the agent ID, so an agent always comes in the same one.
-   Office view: box trucks. A delivery drives up a new service drive behind the shops, reverses into the loading bay, unloads (crates appear by the side door) and leaves. Other box trucks are through traffic. Most carry a shop's name on the side. At most one delivery and two box trucks at once, more often when more agents run. They take their turn with the shop visitors, follow the **Shops and shoppers** setting and do not drive with reduced motion.
-   Office view: the shops have sliding glass doors. A door opens when a shopper walks in or out, and the shopper goes out of sight behind the front. With reduced motion the doors stay shut.
-   Office view: offices stand on a grid all round the town centre (the bank, shops, police station, apartments and park), east of it too, along a second avenue past the shops. They fill ring by ring, nearest the centre first and evenly on every side. A new **Offices in town, at most** setting (12 to 100, 50 by default) caps how many are drawn. The busiest and most recent projects get an office first, nearest the centre. Robberies also happen on the streets east of the centre. `window.CWFun` holds it as `officeMax`. See [Offices in town](documentation/office-view.md#offices-in-town).
-   Office view: every roundabout on the south edge of the town has an in road, with two lanes each way, sidewalks and a solid centre line. Traffic from outside comes in on a random in road and leaves by a random one, the bandits' van too. Each in road has its own queue.
-   Office view: sidewalks and grass verges along every road, zebras at the roundabouts, footpaths to the shops, a side car park at each office, grass, hedges and trees on the open ground.
-   Office view: a park by the east roundabout, with paths, benches, lamps and a playground (swings, a slide, a climbing frame, a sandbox and a see-saw).
-   Office view: kids play in the park's playground (swings, slide, climbing frame, sandbox, see-saw and tag), with parents on the benches. The parents stay seated while the number of kids changes, and kids do not jump back to the start of their play. They walk round the equipment, and there are more of them when more agents run (3 to 16), never more than the new **Kids in the park, at most** setting (0 to 16, 12 by default; `kids` in `window.CWFun`). With reduced motion they stay still at the equipment.
-   Office view: dog walkers on the sidewalks all over town. They cross at the zebras, stop for the dog to sniff trees and lamp posts (or the grass on the side away from the road), and the dog keeps to the sidewalk, also round corners, stepping onto the road only with its walker. Some come from the flats. A new **Dog walkers, at most** setting (0 to 20, 6 by default) caps how many there are; `window.CWFun` holds it as `dogWalkers`.
-   Office view: each office gets from 1 up to 10 armoured cars, depending on how fast its pile of drives grows. An armoured car leaves the dock as soon as it has 10 drives or the pile is empty. Robberies can happen anywhere on a straight street of 32 m or more, in either direction, and one in three stops the armoured car head on. Police units with their siren on drive faster on the street.
-   Office view: speech bubbles in the robbery scene, in made-up words. The bandits shout while they hold the armoured car, the SWAT team barks orders, and during the arrest the bandits protest and the police answer. Bubbles close together are moved apart so they do not overlap, and they stay between the side panels.
-   Office view: people on foot have the right of way at the zebras. A walker steps on only when the cars coming can still stop in comfort, and cars stop before the stripes while someone is on them or about to step on. Siren units keep the right of way, and walkers wait for them. A car never stops with its tail on a roundabout: it waits at the yield line instead, or the walker waits. Nobody stops to chat or let the dog sniff on a zebra.
-   `window.__office.kids()`, `dogs()`, `bubbles()` and `zebras()` for tests and debugging.
-   Office view: patrol cars cruise the town, and now and then one pulls over a speeder. A new **Patrol cars** setting (0 to 4, 2 by default) sets how many; `window.CWFun` holds it as `patrols`. A patrol car follows the normal traffic rules. A speeder drives faster but keeps to the rules. A patrol car near it follows with its lights on, both pull onto the shoulder on a straight, and the officer and the driver talk in speech bubbles before the officer hands over a ticket. One stop at a time, and a robbery or jam call comes first. See [Patrols and speeders](documentation/office-view.md#patrols-and-speeders).
-   `window.__office.patrol()` returns the patrol cars and the traffic stop; `patrol('speed')` starts a stop now.
-   Office view: one police station for every 20 offices drawn, five at most. The extra stations are smaller copies of the main one, in office cells spread round the town, each with its own roads, patrol cars and SWAT van. A jam call or a robbery is answered by the nearest station with free units, and the light bar shows on that station's roof. Units go back to their own station. See [More police stations](documentation/office-view.md#more-police-stations).
-   `window.__office.police()` now also returns `stations` (each station's cell, units and trips) and the station of each unit; `robbery()` returns `cops` (the units sent) and `why` (why the last robbery ended early).
-   Office view: finished agents go home. Their vehicle drives to the apartments, or about one in three goes shopping first. At home it parks, the driver walks in at their block's door and more windows light up. Later the vehicle drives off or fades out. At most three such trips run at once. See [Going home](documentation/office-view.md#going-home).
-   `window.__office.homes()` returns the agents going home; `homes('force')` sends one home now.
-   `window.__office.shops()` now also returns `boxes` (the box trucks) and, under `walkers`, `doors` (the shop doors that are open).
-   Office view: junctions now depend on how many roads meet. Where two roads meet, the road just runs on. Where three meet there is a T-junction: the through road has the right of way and the side road gives way at shark's teeth. Some T-junctions have traffic lights, and some four-way junctions are lit crossings instead of roundabouts (picked at random for each town). Shark's teeth also mark every out road and roundabout entry. Siren units drive through red, and other traffic waits for them. Lanterns stand along the roads. Every vehicle may now turn left out of an out road and into an in road, waiting for a gap (before, only armoured cars could). When offices stand in the row north of the apartments east of the centre, a road links the roundabout east of the apartments to them. `window.__office.junctions()` lists the junctions. See [Roads](documentation/office-view.md#roads).
-   Office view: click a lit window of the apartments and the camera flies up to it, to watch a short story in somebody's home through the glass, with captions under the window. There are 20 stories (a midnight snack, a proposal, a burnt dinner, a new puppy, a magic show and more), and each lit window gets a random one. With reduced motion the camera jumps instead of flying, and the story shows one still per caption. `window.__office.peek()` opens, seeks and closes a story for tests. See [Window stories](documentation/office-view.md#window-stories).

### Changed

-   Office view: more apartment windows are lit when nobody is home (28 instead of 14), so more window stories can be clicked.
-   Effort colours in both views (upper arm, desk screen, legend and cards): low soft yellow, medium green, high orange, xhigh purple, max black. A max-effort desk screen is black with light text lines. Red (failed) and blue (needs you) screens are unchanged.
-   The page is now written in strict TypeScript in `src/` and split into modules: `app/` (start-up and HUD), `common/` (shared code), `factory/` and `office/`, with one file per vehicle type. `npm run build` compiles it to `dist/`, and `npm start` and `npm test` build first. The server serves the files of `dist/` only (an allowlist made at start-up) and shows a note to run `npm run build` when it is missing. No change in what the page does. See [Front-end files](documentation/getting-started.md#front-end-files).
-   Getting started: run `npm ci` once, then `npm start`. The only packages are the pinned dev tools `typescript` 6.0.3 and `@types/three` 0.160.0; the server still uses Node built-ins only.
-   Desktop app: `npm run dev` and `npm run build` build the page first, and the app bundles the files of `dist/`.
-   CI builds the page and runs the type check before the tests.
-   Factory view: an empty transport robot drives 30 % faster than a loaded one.
-   Camera: the view no longer flies back to the overview after 30 seconds without input. Esc or the back button still returns to it.
-   The New session, Refresh, Usage and Settings buttons sit in two rows, so they fit the left card at 1100 px and below.
-   A change in a transcript reaches an open page within about 0.2 seconds, not at the next one-second tick.
-   Office view: in a desk view the back button reads "Office · Esc", because it returns to the office first.
-   Office view: a vehicle leaving onto the street also waits for traffic that is about to come off a roundabout into its far lane.
-   Office view: where a road has no shoulder (the lane along the bank fence), a patrol car on a call-out stops in the lane with its hazard lights on.
-   Office view: police units with their lights on have the right of way. Vehicles wait for them at roundabouts and out roads, and vehicles ahead move over onto the shoulder where there is room. The lights are off on the way back to the station.
-   Office view: a police unit with its lights on may turn left over a roundabout island, turn left out of an out road across the near lane, and make a U-turn across the street to its stop, when that way is shorter.
-   Office view: an empty armoured car drives about 30 % faster on the street than a loaded one.
-   Office view: the bank yard is deeper, with 16 bays (was 10) in two rows of 8, each row with its own pair of lanes, and two armoured cars can load at the same office at once from a longer lay-by. The drives at the dock pile up on a pallet and keep growing until a car picks them up (at most 300 per dock are drawn). An armoured car carries up to 10 drives (was 3).
-   Office view: the robbery van no longer always waits at the same spot. It picks a stretch of the lane toward the avenue behind any office in any row, a few metres different each time, and not the same stretch twice in a row. Stretches where more armoured cars are loading are picked more often. While an armoured car is pulled over, a light bar on the police station roof flashes blue and red.
-   Office view: a traffic jam can bring a patrol car while the robbery van drives to or waits on its street. A robbery does not start while a patrol car is out on a jam.
-   Office view: every road has two lanes each way (the road from the gate is still driven as one lane each way), and every roundabout has two lanes. Each office street has a roundabout just west of every office, between neighbouring offices and after the last one, in place of the turnaround at the end. Offices stand 60 m apart along a street (was 42 m) and rows 33 m apart (was 30 m), so queues have room on both sides of each roundabout. See [Roads](documentation/office-view.md#roads).
-   Office view: an out road only turns right, into the outer lane; a vehicle going the other way goes round the roundabout just west of its office. Vehicles move to the inner lane only to turn left at the next roundabout.
-   Office view: a vehicle enters a roundabout only when there is room for it past its exit, and waits before the marked box where an out road joins the street until there is room past it. Vehicles in the inner lane move into the outer lane for a police unit with its lights on.
-   Office view: roundabout entry is lane by lane. A car entering in the outer lane waits only for outer-lane traffic, and a car entering in the inner lane waits for both lanes, each only for a vehicle that would reach its entry first. The inner lane moves over to the outer lane before its exit. Lane changes, and cars returning from the shoulder after a siren, wait for a gap in the other lane. A patrol car drops a U-turn short cut after about 8 seconds without a gap. The overview fits the town to the space between the side panels.
-   Office view: a vehicle that changes lanes just in front of another and has to stop there no longer locks with it. After 3 s the one in front drives on, because its tail moves away from the other vehicle's nose.
-   Office view: people no longer walk through each other when many arrive or leave at once. The front door, lobby and path to the cars run one way at a time (at most four people), newcomers wait in their car and leavers wait at their desk or at the end of the desk area until it is their turn. People going in and out of the rooms use separate aisles.

### Fixed

-   A subagent sent out by another subagent now has that subagent as its `parentId` in `/api/state`, not the main agent. It is a worker in the office view and an arm in the factory view like any other subagent. See [Subagents of subagents](documentation/api.md#subagents-of-subagents).
-   A finished subagent that is resumed shows as running again, not as done.
-   Office view: armoured cars no longer lock together in the bank yard. The car for the bay next to the out road used to stand at its stop with its nose beside the out road, while the cars queued for the out road kept its bay area busy. It now waits 3 m earlier until the bay area and the out road are clear, then reverses in without stopping.
-   Office view: an armoured car leaving the bank also waits until the short stretch to the next roundabout has room for it, so its tail does not stand over the other lane.
-   Office view: two armoured cars side by side (one turning into the bank, one passing it) no longer wait for each other's tail. A vehicle that drives straight on is not held up by something beside its own tail.
-   Office view: vehicles queued behind a patrol car stopped in the lane do not count as stuck.
-   Office view: in a robbery the second patrol car parks further ahead of the bandits' van and no longer blocks the lane beside it.
-   Office view: traffic no longer locks up with the larger bank. At most 10 armoured cars are out on a run at once (the office that has waited longest is served first), an armoured car leaving a lay-by takes turns with cars backing out of their spots, and stop lines at out roads sit further back.
-   Office view: a patrol car leaving the station no longer locks up with a queue at the roundabout, and vehicles that moved over for a siren pull back in only when the lane beside them is clear.
-   Office view: a patrol car leaving the station no longer locks with an armoured car coming off the roundabout. It waits for traffic about to come off the roundabout, and vehicles stop well back from a siren unit that crosses in front of them.
-   Office view: police units with their lights on have the right of way again, and they turn into the street at a robbery. The U-turn check counted the robbed armoured car on the shoulder as a queue, so the unit drove the long way round. Traffic now stops for a unit waiting to pull out, also at the roundabout line, and a queue in front of a unit moves on so it is not held behind it.
-   Office view: a vehicle that moves over to the shoulder no longer swings its tail into a vehicle beside it.
-   Office view: a robbery no longer ends early when the police are called. The spot for the second patrol car, ahead of the van, could fall on the curve where the inner lane merges into the outer lane, which no route reaches, so the call was dropped. Units now stop only on a lane itself.
-   Office view: the streets south and east of the police station count as public roads for police units. Before, everything south-east of the station was taken for its yard, so no jam there was answered and a unit could not make a U-turn there.
-   Office view: an empty armoured car looks far enough ahead to stop at a roundabout line at its higher speed, and vehicles leaving an out road allow for fast traffic on the street.
-   Office view: a walker stuck for 20 seconds is moved on again (the backstop had been switched off by mistake), an armoured car whose office has closed drives home instead of stopping, and the extra armoured car in a robbery shows its load.
-   Office view: turn-signal lamps no longer show while they are off. The new vehicles had dark lamp housings (and the motorcycle stalks) that were always visible. Now the lamps show only while a vehicle signals or has its hazard lights on, on every kind of vehicle.
-   Office view: shoppers no longer shrink away at a shop door. The door slides open and they walk in behind the front, and come out the same way.
-   Office view: a shopper at the very end of the footpath no longer stands in the way of a newcomer starting there. Before, the two could block each other until one walked on regardless.
-   Office view: a police unit making a U-turn or a left turn across the street to its stop no longer waits up to 8 seconds at the cut. Traffic in the lane it joins and the lane beside it now stops a few metres before the cut while it comes up and crosses. A vehicle standing at a roundabout line right where the unit joins waited for the unit while the unit waited for it, until the unit gave up the short cut; now that vehicle goes first.
-   Office view: the grass reaches past the screen edges in the overview and zoomed all the way out, at any number of offices. The ground, the fog and the camera's depth range grow with the town.
-   Office view: a vehicle turning left into a street now waits for a gap in both lanes it crosses or joins. Before, it could pull out in front of traffic in the far lane and lock with it.
-   Office view: a vehicle leaving an out road looks at the street again when it was held at the give-way line by something else, such as a keep-clear box. Before, it checked once, and in a big town a truck leaving the bank could pull out in front of a car that had come up in the meantime. The two stood nose to side until one faded out.
-   Office view: on a phone-sized screen the side panels hide while you watch a window story, so they no longer cover the window and the captions.
## 0.1.2 - 2026-11-15

### Fixed

-   A new robot arm no longer appears inside another arm: it waits until its spot on the line is empty.

## 0.1.1 - 2026-11-15

### Fixed

-   The installer's name in a release has no spaces, so `sha256sum -c SHA256SUMS.txt` finds the downloaded file.

## 0.1.0 - 2026-11-15

### Added

-   The live factory view, chat with dashboard sessions, the global permission hook and the desktop app.
-   Chat with terminal and desktop sessions: messages arrive as from a teammate, held messages of bypass-mode sessions are shown as held.
-   **Refresh** button that rescans and reconnects without reloading the page.
-   **New session** dialog: folder field that follows the project, a folder browser, and opt-in **Skip permission prompts**.
-   Slash command list in the chat panel of dashboard sessions.
-   **Usage** view with plan limits (5-hour and weekly) and tokens and cost per day and hour, per model.
-   Right-click a transport robot and choose **Drive** to clear a jam.
-   Documentation folder, demo data generator (`dev/demo/make-demo.js`), GitHub workflows and project policies.

### Changed

-   Hall names are on a fixed sign on poles along the front of the roof (no closed-session count; a floating tag only shows "needs you"), the siren sits in the middle of the roof, and the chimney smoke is lighter so it shows on the dark floor.
-   Transport robots are easier to right-click: a bigger hit area, and the cursor changes over a robot.

### Fixed

-   The folder browser no longer shows when the New session dialog opens.
-   The close button of the Usage view is centred.
