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
  createChannel(input) {
    return write("settings.createChannel", () => {
      const channel = { ...input, id: `chan_${Math.random().toString(36).slice(2, 10)}` };
      db.settings = { ...db.settings, channels: [...db.settings.channels, channel] };
      return clone(channel);
    });
  },
  updateChannel(id, input) {
    return write("settings.updateChannel", () => {
      const channel = { ...input, id };
      db.settings = {
        ...db.settings,
        channels: db.settings.channels.map((c) => (c.id === id ? channel : c)),
      };
      return clone(channel);
    });
  },
  deleteChannel(id) {
    return write("settings.deleteChannel", () => {
      db.settings = {
        ...db.settings,
        channels: db.settings.channels.filter((c) => c.id !== id),
      };
    });
  },
};
