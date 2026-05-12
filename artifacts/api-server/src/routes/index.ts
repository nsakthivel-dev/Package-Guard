import { Router, type IRouter } from "express";
import healthRouter from "./health";
import environmentsRouter from "./environments";
import packagesRouter from "./packages";
import snapshotsRouter from "./snapshots";
import historyRouter from "./history";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(environmentsRouter);
router.use(packagesRouter);
router.use(snapshotsRouter);
router.use(historyRouter);
router.use(settingsRouter);
router.use(dashboardRouter);

export default router;
