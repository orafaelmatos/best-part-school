import { BrowserRouter, Route, Routes } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import AppProviders from "../AppProviders";
import { publicRoutes } from "./routes";

export function SiteRoutes() {
  return <Routes>{publicRoutes()}<Route path="*" element={<NotFound />} /></Routes>;
}

export default function SiteApp() {
  return <AppProviders><BrowserRouter><SiteRoutes /></BrowserRouter></AppProviders>;
}
