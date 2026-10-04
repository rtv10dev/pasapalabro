import { setUpHome } from "./home";
import { matchIdFromPath } from "./match-link";
import { followMatch } from "./match";

const matchId = matchIdFromPath(location.pathname);
if (matchId) followMatch(matchId);
else setUpHome();
