//---------------------------------------------------------------------
// Performance Report
//---------------------------------------------------------------------
import {v4 as uuid} from "node-uuid";
import {Program} from "../runtime/dsl2";
import {PerformanceTracker} from "../runtime/performance";


export class PerformanceReporter {
  constructor() { }

  blocksToEAVs(blocks:any, eavs:any[] = []) {
    for(let name in blocks) {
      let {counts, times} = blocks[name];
      let blockId = uuid();
      eavs.push(
        [blockId, "tag", "block"],
        [blockId, "name", name],
      );
      for(let property in counts) {
        let count = counts[property];
        let time = times[property];
        let propertyId = uuid();
        eavs.push(
          [blockId, "property", propertyId],
          [propertyId, "name", property],
          [propertyId, "count", count],
          [propertyId, "time", time]
        );
      }
    }
    return eavs as any[];
  }

  totalsToEAVs(counts:any, times:any, eavs:any[] = []) {
    let blockId = uuid();
    eavs.push(
      [blockId, "tag", "total"],
    );
    for(let property in counts) {
      let count = counts[property];
      let time = times[property];
      let propertyId = uuid();
      eavs.push(
        [blockId, "property", propertyId],
        [propertyId, "name", property],
        [propertyId, "count", count],
        [propertyId, "time", time]
      );
    }
  }

  report(perf:PerformanceTracker) {
    let eavs = this.blocksToEAVs(perf.blocks);
    this.totalsToEAVs(perf.counts, perf.times, eavs);
    let me = new Program("Performance report");
    me.attach("ui");

    me.block("calculate block percentage", ({find, record, lib: {math}}) => {
      let total = find("total");
      total.property.name == "transaction"
      let block = find("block");
      let property = block.property;
      property.name == "block";
      let percent = math.round(property.time * 100 / total.property.time);
      return [
        block.add("percent", percent)
      ]
    });

    me.block("draw total", ({find, record, lib: {math}}) => {
      let container = find("block-times")
      let total = find("total");
      let property = total.property;
      let avg = math.toFixed(property.time / property.count, 4);
      let timeStr = math.toFixed(property.time, 2)
      return [
        container.add("children", [
          record("ui/row", {total})
          .add("style", record({flex: "none", padding: "10px 20px", "margin-bottom":"10px", background: "#ccc"}))
          .add("sort", -10000).add("children", [
            record("ui/column", {total, sort:0}).add("children", [
              record("ui/text", {text:"Total", sort:0, style: record({"font-size": "16pt"})}),
              record("ui/row", {total, sort:1, style:record({"font-size":"14pt", margin:"10px 0"})}).add("children", [
                record("ui/text", {text:property.count, sort:0}),
                record("ui/text", {text:timeStr, sort:1, style: record({margin: "0 10px"})}),
                record("ui/text", {text:avg, sort:2}),
              ]),
            ]),
            record("ui/spacer", {sort:1}),
            record("ui/text", {text:"100%", sort:1, style:record({"font-size":"20pt"})})
          ])
        ])
      ]
    });

    me.block("draw blocks 2", ({find, record, lib: {math}}) => {
      let block = find("block");
      let {name, property} = block;
      property.name == "block"
      let rev = -1;
      let avg = math.toFixed(property.time / property.count, 4);
      let timeStr = math.toFixed(property.time, 2)
      let foo = record({"font-size":"14pt", margin: "10px 0"});
      return [
        record("ui/column", "block-times", {style:record({"max-width":500}), sort:2}).add("children", [
          record("ui/row", {block})
            .add("style", record({flex: "none", padding: "10px 20px", "margin-bottom":"10px", background: "#ccc"}))
            .add("sort", rev * property.time).add("children", [
              record("ui/column", {block, sort:0}).add("children", [
                record("ui/text", {text:block.name, sort:0, style: record({"font-size": "16pt"})}),
                record("ui/row", {block, sort:1, style:foo}).add("children", [
                  record("ui/text", {text:property.count, sort:0}),
                  record("ui/text", {text:timeStr, sort:1, style: record({margin: "0 10px"})}),
                  record("ui/text", {text:avg, sort:2}),
                ]),
                record("ui/column", "props", {block, sort:2})
              ]),
              record("ui/spacer", {sort:1}),
              record("ui/text", {text:block.percent + "%", sort:1, style:record({"font-size":"20pt"})})
            ])
        ])
      ]
    });

    me.block("draw props", ({find, record, lib: {math}}) => {
      let container = find("props");
      let {block} = container;
      let property = block.property;
      property.name != "block"
      let avg = math.toFixed(property.time / property.count, 4);
      let timeStr = math.toFixed(property.time, 2)
      return [
        container.add("children", [
          record("ui/row", {block, property, sort:property.name}).add("children", [
            record("ui/text", {sort:0, text:property.name, style:record({"margin-right":"15px", width:"120px"})}),
            record("ui/text", {sort:1, text:property.count, style:record({width:50})}),
            record("ui/text", {sort:2, text:timeStr, style:record({margin: "0 10px", width:50})}),
            record("ui/text", {sort:3, text:avg, style:record({width:50})}),
          ])
        ])
      ]
    });

    me.block("Translate elements into html", ({find, record, union}) => {
      let elem = find("html/div");
      return [elem.add("tag", "html/element").add("tagname", "div")];
    });

    // console.profile("perf");
    me.inputEavs(eavs);
    // console.profileEnd();
  }

}

let baseline = {"times":{"transaction":1559.8550000000002},"counts":{"transaction":155},"blocks":{"setup timers":{"counts":{"block":5022,"PresolveCheck":0,"GenericJoin":0},"times":{"block":14.034999999994398,"PresolveCheck":0,"GenericJoin":0}},"Remove click events!":{"counts":{"block":10044,"PresolveCheck":110,"GenericJoin":0},"times":{"block":13.43499999997448,"PresolveCheck":0.23000000000092768,"GenericJoin":0}},"Elements with no parents are roots.":{"counts":{"block":10044,"PresolveCheck":1486,"GenericJoin":190},"times":{"block":42.510000000021364,"PresolveCheck":3.640000000006694,"GenericJoin":3.845000000001164}},"Create an instance for each child of a rooted parent.":{"counts":{"block":10044,"PresolveCheck":2230,"GenericJoin":268},"times":{"block":58.76499999999328,"PresolveCheck":12.61500000000592,"GenericJoin":9.5949999999998}},"Export all instances.":{"counts":{"block":10044,"PresolveCheck":1302,"GenericJoin":186},"times":{"block":32.044999999980746,"PresolveCheck":3.1350000000034015,"GenericJoin":4.429999999996198}},"Export roots.":{"counts":{"block":10044,"PresolveCheck":2,"GenericJoin":2},"times":{"block":10.035000000010314,"PresolveCheck":0.015000000000100044,"GenericJoin":0.03499999999962711}},"Export instance parents.":{"counts":{"block":10044,"PresolveCheck":554,"GenericJoin":184},"times":{"block":23.02999999999588,"PresolveCheck":1.8199999999999363,"GenericJoin":3.1999999999986812}},"Export element styles.":{"counts":{"block":10044,"PresolveCheck":10418,"GenericJoin":1},"times":{"block":70.72999999996205,"PresolveCheck":38.89999999996758,"GenericJoin":0.2949999999998454}},"Export element attributes.":{"counts":{"block":10044,"PresolveCheck":10788,"GenericJoin":4086},"times":{"block":133.43500000000154,"PresolveCheck":42.17999999998483,"GenericJoin":43.32000000000221}},"draw the game world":{"counts":{"block":5022,"PresolveCheck":1,"GenericJoin":1},"times":{"block":11.345000000002983,"PresolveCheck":0.044999999999845386,"GenericJoin":2.7650000000003274}},"draw the main menu":{"counts":{"block":5022,"PresolveCheck":4,"GenericJoin":2},"times":{"block":9.915000000004056,"PresolveCheck":0.08999999999991815,"GenericJoin":0.19000000000028194}},"draw the game over menu":{"counts":{"block":5022,"PresolveCheck":10,"GenericJoin":0},"times":{"block":15.044999999990296,"PresolveCheck":0.09000000000105501,"GenericJoin":0}},"calculate the score":{"counts":{"block":5022,"PresolveCheck":200,"GenericJoin":199},"times":{"block":14.614999999993188,"PresolveCheck":0.6000000000005912,"GenericJoin":2.8449999999988904}},"clicking starts the game":{"counts":{"block":5022,"PresolveCheck":127,"GenericJoin":110},"times":{"block":39.78500000001327,"PresolveCheck":1.9649999999994634,"GenericJoin":7.139999999999873}},"draw the player":{"counts":{"block":5022,"PresolveCheck":1428,"GenericJoin":197},"times":{"block":40.729999999991605,"PresolveCheck":9.180000000000518,"GenericJoin":11.09999999999468}},"draw obstacles":{"counts":{"block":5022,"PresolveCheck":1080,"GenericJoin":378},"times":{"block":162.57000000000403,"PresolveCheck":7.26999999999407,"GenericJoin":99.70999999999572}},"every 2 distance, a wild obstacle appears":{"counts":{"block":5022,"PresolveCheck":204,"GenericJoin":200},"times":{"block":40.62999999998988,"PresolveCheck":2.460000000001628,"GenericJoin":22.080000000002656}},"adjust the height of the gap":{"counts":{"block":5022,"PresolveCheck":2044,"GenericJoin":440},"times":{"block":133.72000000002367,"PresolveCheck":64.90000000000441,"GenericJoin":47.21999999999548}},"apply a velocity when you click":{"counts":{"block":5022,"PresolveCheck":224,"GenericJoin":110},"times":{"block":18.65500000000452,"PresolveCheck":2.624999999998181,"GenericJoin":3.0799999999994725}},"scroll the world":{"counts":{"block":5022,"PresolveCheck":2384,"GenericJoin":1095},"times":{"block":482.3849999999866,"PresolveCheck":261.6300000000017,"GenericJoin":173.37500000000523}},"Translate elements into html":{"counts":{"block":5022,"PresolveCheck":1,"GenericJoin":0},"times":{"block":5.629999999994197,"PresolveCheck":0.010000000000218279,"GenericJoin":0}},"Translate elements into svg":{"counts":{"block":20088,"PresolveCheck":185,"GenericJoin":0},"times":{"block":21.100000000014916,"PresolveCheck":0.4450000000001637,"GenericJoin":0}}}}
