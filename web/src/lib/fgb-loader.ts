// FlatGeobuf bbox loader — stub until ETL produces buildings_<city>.fgb.
//
// Final implementation will use HTTP Range Requests to load only features
// within the current map viewport, which is the entire point of choosing FGB.
//
// See: https://flatgeobuf.org/examples/maplibre/
// import * as flatgeobuf from 'flatgeobuf'

export interface Bbox {
  minX: number  // west longitude
  minY: number  // south latitude
  maxX: number  // east longitude
  maxY: number  // north latitude
}

export async function loadBuildingsForBbox(
  _bbox: Bbox,
  _city = 'turku',
): Promise<GeoJSON.FeatureCollection> {
  // TODO: implement once ETL produces the FlatGeobuf file.
  //
  // const r2Url = import.meta.env.VITE_R2_PUBLIC_URL
  // const url = `${r2Url}/buildings_${_city}.fgb`
  // const features: GeoJSON.Feature[] = []
  // for await (const f of flatgeobuf.geojson.deserialize(url, _bbox)) {
  //   features.push(f as GeoJSON.Feature)
  // }
  // return { type: 'FeatureCollection', features }

  return { type: 'FeatureCollection', features: [] }
}
