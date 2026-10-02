import { setUpHome } from "./home";
import { followMatch } from "./match";

const matchPath = /^\/m\/([^/]+)$/.exec(location.pathname);
if (matchPath?.[1]) followMatch(matchPath[1]);
else setUpHome();
