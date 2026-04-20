import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const DeployPage = lazy(() => import("./pages/DeployPage"));
const ManagePage = lazy(() => import("./pages/ManagePage"));
const InteractPage = lazy(() => import("./pages/InteractPage"));

const routeFallback = (
	<div className="card animate-pulse space-y-3">
		<div className="h-4 w-32 rounded bg-white/[0.06]" />
		<div className="h-3 w-48 rounded bg-white/[0.04]" />
		<div className="h-3 w-40 rounded bg-white/[0.04]" />
	</div>
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<HashRouter>
			<Routes>
				<Route element={<App />}>
					<Route
						index
						element={
							<Suspense fallback={routeFallback}>
								<HomePage />
							</Suspense>
						}
					/>
					<Route
						path="deploy"
						element={
							<Suspense fallback={routeFallback}>
								<DeployPage />
							</Suspense>
						}
					/>
					<Route
						path="manage"
						element={
							<Suspense fallback={routeFallback}>
								<ManagePage />
							</Suspense>
						}
					/>
					<Route
						path="interact"
						element={
							<Suspense fallback={routeFallback}>
								<InteractPage />
							</Suspense>
						}
					/>
				</Route>
			</Routes>
		</HashRouter>
	</StrictMode>,
);
