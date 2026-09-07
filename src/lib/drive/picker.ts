import { API_KEY, CLIENT_ID, getToken, loadGis } from "./auth";

/* drive.file also covers whatever the user hands the app through the Picker,
   which is what makes "Add from Drive" possible without asking for a
   restricted scope. */

const GAPI_SRC = "https://apis.google.com/js/api.js";

type PickerDoc = { id: string; name: string; mimeType: string; sizeBytes?: number };

/* The Picker namespace hangs off the same `google` global that Identity
   Services uses, but it is loaded separately by gapi. Rather than widen the
   declaration in auth.ts, it is read through a narrow view of the window. */
type PickerNamespace = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  Action: { PICKED: string; CANCEL: string };
  Feature: { NAV_HIDDEN: string };
};

function pickerNamespace(): PickerNamespace | undefined {
  return (window as unknown as { google?: { picker?: PickerNamespace } }).google?.picker;
}

type DocsView = {
  setMimeTypes: (m: string) => DocsView;
  setIncludeFolders: (b: boolean) => DocsView;
  setSelectFolderEnabled: (b: boolean) => DocsView;
};

type PickerBuilder = {
  addView: (v: DocsView) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  setCallback: (cb: (d: { action: string; docs?: PickerDoc[] }) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
}

async function loadPicker(): Promise<PickerNamespace> {
  await loadGis();
  const found = pickerNamespace();
  if (found) return found;
  if (!window.gapi) await loadScript(GAPI_SRC);
  await new Promise<void>((resolve) => window.gapi!.load("picker", () => resolve()));
  const loaded = pickerNamespace();
  if (!loaded) throw new Error("The Google Picker did not load.");
  return loaded;
}

export const pickerConfigured = Boolean(API_KEY);

export async function pickFromDrive(): Promise<PickerDoc | null> {
  if (!API_KEY) {
    throw new Error(
      "Add from Drive needs VITE_GOOGLE_API_KEY (a key restricted to the Picker API) in .env.",
    );
  }
  const developerKey = API_KEY;
  const token = await getToken();
  const picker = await loadPicker();

  return new Promise<PickerDoc | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes("application/pdf,application/epub+zip")
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(developerKey)
      .setTitle("Choose a book")
      .setCallback((data: { action: string; docs?: PickerDoc[] }) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] ?? null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      });

    /* The app id is the numeric project prefix of the OAuth client id. */
    const appId = CLIENT_ID?.split("-")[0];
    if (appId) builder.setAppId(appId);

    builder.build().setVisible(true);
  });
}
