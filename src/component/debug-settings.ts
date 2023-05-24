export const DebugSettings = {
  renderRows: false,
};

export function installDebugGui() {
  import("lil-gui").then((GUI) => {
    const gui = new GUI.GUI();
    gui.add(DebugSettings, "renderRows");
  });
}
