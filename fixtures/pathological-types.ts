type Union40 =
  | { kind: "v01"; value: 1 }
  | { kind: "v02"; value: 2 }
  | { kind: "v03"; value: 3 }
  | { kind: "v04"; value: 4 }
  | { kind: "v05"; value: 5 }
  | { kind: "v06"; value: 6 }
  | { kind: "v07"; value: 7 }
  | { kind: "v08"; value: 8 }
  | { kind: "v09"; value: 9 }
  | { kind: "v10"; value: 10 }
  | { kind: "v11"; value: 11 }
  | { kind: "v12"; value: 12 }
  | { kind: "v13"; value: 13 }
  | { kind: "v14"; value: 14 }
  | { kind: "v15"; value: 15 }
  | { kind: "v16"; value: 16 }
  | { kind: "v17"; value: 17 }
  | { kind: "v18"; value: 18 }
  | { kind: "v19"; value: 19 }
  | { kind: "v20"; value: 20 }
  | { kind: "v21"; value: 21 }
  | { kind: "v22"; value: 22 }
  | { kind: "v23"; value: 23 }
  | { kind: "v24"; value: 24 }
  | { kind: "v25"; value: 25 }
  | { kind: "v26"; value: 26 }
  | { kind: "v27"; value: 27 }
  | { kind: "v28"; value: 28 }
  | { kind: "v29"; value: 29 }
  | { kind: "v30"; value: 30 }
  | { kind: "v31"; value: 31 }
  | { kind: "v32"; value: 32 }
  | { kind: "v33"; value: 33 }
  | { kind: "v34"; value: 34 }
  | { kind: "v35"; value: 35 }
  | { kind: "v36"; value: 36 }
  | { kind: "v37"; value: 37 }
  | { kind: "v38"; value: 38 }
  | { kind: "v39"; value: 39 }
  | { kind: "v40"; value: 40 };

type Intersect8<T> = T &
  { readonly a: string } &
  { readonly b: number } &
  { readonly c: boolean } &
  { readonly d: Date } &
  { readonly e: Error } &
  { readonly f: Promise<T> } &
  { readonly g: Array<T> };

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

type Jsonish =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Jsonish }
  | Jsonish[];

type RecursiveEnvelope<T> = {
  value: T;
  children: Array<RecursiveEnvelope<T>>;
  metadata: DeepReadonly<Record<string, Jsonish>>;
};

export const unionTarget = null as unknown as Union40;
export const intersectionTarget = null as unknown as Intersect8<Union40>;
export const conditionalTarget = null as unknown as DeepReadonly<
  Record<string, Intersect8<Union40>>
>;
export const recursiveTarget = null as unknown as RecursiveEnvelope<
  Intersect8<Union40>
>;
