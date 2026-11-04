// STUB: replaced by views unit
import type {
  ArchiveIndexModel,
  ArchiveMonthModel,
  HomeModel,
  ItemModel,
  Layout,
  SourcesModel,
  StatusModel,
} from "./types.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (model: Layout) =>
  `<!doctype html><html><head><title>${esc(model.title)}</title></head><body><pre>${esc(JSON.stringify(model, null, 2))}</pre></body></html>`;

export const renderHome = (model: HomeModel): string => page(model);
export const renderItem = (model: ItemModel): string => page(model);
export const renderArchiveIndex = (model: ArchiveIndexModel): string => page(model);
export const renderArchiveMonth = (model: ArchiveMonthModel): string => page(model);
export const renderSources = (model: SourcesModel): string => page(model);
export const renderStatus = (model: StatusModel): string => page(model);
export const renderNotFound = (model: Layout): string => page(model);
