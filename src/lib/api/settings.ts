import type { SettingsService } from "./contracts";
import { clone, db } from "./mock/db";
import { read, write } from "./mock/transport";

export const settingsApi: SettingsService = {
  get() {
    return read("settings.get", () => clone(db.settings));
  },
  update(patch) {
    return write("settings.update", () => {
      db.settings = { ...db.settings, ...patch };
      return clone(db.settings);
    });
  },
};
