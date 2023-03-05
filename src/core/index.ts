import init, { parse } from "../../aftermath-core/pkg/aftermath_core";

init().then((aftermath_core) => {
  console.log(aftermath_core);
  console.log(
    parse({
      values: [],
    })
  );
});
