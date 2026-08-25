import type { ComponentProps } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  InfiniteRowModelModule,
  ModuleRegistry,
  RowSelectionModule,
  TextFilterModule,
  themeQuartz,
} from "ag-grid-community";

// Keep the full AG Grid runtime outside the authentication/bootstrap bundle.
// The workspace only fetches it when a list surface needs to render.
// The three Phase 1 tables use only the infinite model, text filters, and
// row selection. Registering the complete community feature set also ships unrelated editors,
// CSV, pagination, grouping, and client-side model code to every table visit.
ModuleRegistry.registerModules([
  InfiniteRowModelModule,
  RowSelectionModule,
  TextFilterModule,
]);

const appTheme = themeQuartz.withParams({
  accentColor: "#72e0b5",
  backgroundColor: "#101720",
  browserColorScheme: "dark",
  foregroundColor: "#edf3f9",
  headerBackgroundColor: "#151e29",
  headerTextColor: "#b8c5d4",
  oddRowBackgroundColor: "#121b25",
  rowHoverColor: "#1c2a38",
  borderColor: "#263445",
  wrapperBorderRadius: "12px",
});

export default function WatchTrackerGrid(
  props: ComponentProps<typeof AgGridReact>,
) {
  return <AgGridReact theme={appTheme} {...props} />;
}
