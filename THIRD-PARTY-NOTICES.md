# Third-party notices and source references — scoped collection

Collected 2026-10-09 for the existing M1a dependencies. **This is not a complete inventory, a deployable compliance package, owner acceptance of license obligations, or legal/security clearance.** It does not change the project's own license. The intended deliveries are a private source repository, a hosted website, and a future mobile app whose technology/distribution is undecided.

The [collection manifest](docs/third-party-licenses/manifest.json) records exact package versions, original file paths, upstream URLs, lockfile archive integrity where available, and SHA-256/byte counts for each collected file. Texts retain their upstream content; the esrecurse notice is a verbatim source-header excerpt. Supplemental license texts do not manufacture missing component copyright notices. Local package files were copied from the already-installed, previously reviewed dependencies; their bytes were checked against those files, not independently against every registry archive. Only the two provenance archives below received a new archive-integrity check.

## Application and direct tooling

These licenses cover the named packages, not every component they bundle. Exact registry archive/source references are in the manifest. Existing production/build evidence is described in the [brief](docs/project-brief.md#production-dependency-suitability-and-release-requirements--2026-10-09); this task did not rebuild or alter packaging.

| Package/version | Role | Preserved upstream material |
| --- | --- | --- |
| Next 16.4.0 | Website server/framework; some framework code reaches browser bundles | [MIT](docs/third-party-licenses/next-16.4.0-license.md). Preserve applicable `dist/compiled` notices too; this collection does not cover that entire tree. |
| React 19.3.0 | Website rendering, including browser code | [MIT](docs/third-party-licenses/react-19.3.0-LICENSE) |
| React DOM 19.3.0 | Server/browser rendering | [MIT](docs/third-party-licenses/react-dom-19.3.0-LICENSE) |
| @eslint/js 10.0.1 | Lint tooling | [MIT](docs/third-party-licenses/eslint--js-10.0.1-LICENSE) |
| @next/eslint-plugin-next 16.4.0 | Lint tooling | Package omits LICENSE; declaration corroborated by the exact [Next release license](https://github.com/vercel/next.js/blob/v16.4.0/license.md), copied above. Not independent notice coverage for every plugin dependency. |
| @playwright/test 1.64.0 | Browser test tooling | [Apache-2.0](docs/third-party-licenses/playwright--test-1.64.0-LICENSE), [NOTICE](docs/third-party-licenses/playwright--test-1.64.0-NOTICE), and [playwright-core 1.64.0 NOTICE](docs/third-party-licenses/playwright-core-1.64.0-NOTICE). Chromium and all tool bundles are outside this scoped collection. |
| @types/node 24.19.1 | Development declarations | [MIT](docs/third-party-licenses/types--node-24.19.1-LICENSE) |
| @types/react 19.3.0 | Development declarations | [MIT](docs/third-party-licenses/types--react-19.3.0-LICENSE) |
| @types/react-dom 19.3.0 | Development declarations | [MIT](docs/third-party-licenses/types--react-dom-19.3.0-LICENSE) |
| ESLint 10.12.0 | Lint tooling | [MIT](docs/third-party-licenses/eslint-10.12.0-LICENSE) |
| eslint-plugin-react-hooks 7.1.1 | Lint tooling | [MIT](docs/third-party-licenses/eslint-plugin-react-hooks-7.1.1-LICENSE) |
| TypeScript 6.0.3 | Compiler/typecheck tooling | [Apache-2.0](docs/third-party-licenses/typescript-6.0.3-LICENSE.txt) |
| typescript-eslint 8.71.1 | Lint tooling | [MIT](docs/third-party-licenses/typescript-eslint-8.71.1-LICENSE) |
| Vitest 5.0.3 | Unit-test tooling | [Aggregate license/notices](docs/third-party-licenses/vitest-5.0.3-LICENSE.md) |

## Identified transitive and framework components

| Component/version | Verified material and source | Coverage still needed |
| --- | --- | --- |
| Sharp 0.35.5; @img/sharp-win32-x64 0.35.5 | [Sharp Apache text](docs/third-party-licenses/sharp-0.35.5-LICENSE), [native package Apache text](docs/third-party-licenses/img--sharp-win32-x64-0.35.5-LICENSE), [native README/copyright/component terms](docs/third-party-licenses/img--sharp-win32-x64-0.35.5-README.md), [actual native versions](docs/third-party-licenses/img--sharp-win32-x64-0.35.5-versions.json). | Wrapper Apache text is insufficient for native libraries. Windows server trace includes Sharp/native `.node` but omits relevant notices and DLLs. Verify the final target's complete binary/notice/source set and LGPL obligations. |
| sharp-libvips build release 1.3.4 | Exact [upstream component notices](docs/third-party-licenses/sharp-libvips-1.3.4-THIRD-PARTY-NOTICES.md) and [versions](docs/third-party-licenses/sharp-libvips-1.3.4-versions.properties); [release source/build scripts](https://github.com/lovell/sharp-libvips/tree/v1.3.4). | Source archives, patches, build inputs and every library-specific copyright/license file are not assembled. `libnsgif` is named by upstream notices but lacks a version in the installed Windows version map: inclusion/version unknown. Other target packages are not covered by this Windows evidence. |
| lightningcss 1.33.0; lightningcss-win32-x64-msvc 1.33.0 | [MPL-2.0](docs/third-party-licenses/lightningcss-1.33.0-LICENSE), [binding license](docs/third-party-licenses/lightningcss-win32-x64-msvc-1.33.0-LICENSE); [exact npm source commit](https://github.com/parcel-bundler/lightningcss/tree/1d680fa14e9a089c92dc0929f869d6757ae91c30). | Build/test tooling, not identified in current runtime traces. Covered-source access/modifications and native dependency closure if a builder/binding ships. |
| Rust lightningcss 1.0.0-alpha.72; @next/swc-win32-x64-msvc 16.4.0 | [Next Cargo.lock](https://github.com/vercel/next.js/blob/v16.4.0/Cargo.lock), [exact crate metadata](https://crates.io/api/v1/crates/lightningcss/1.0.0-alpha.72), [crate source archive](https://crates.io/api/v1/crates/lightningcss/1.0.0-alpha.72/download). MPL-2.0 declaration previously verified; compiler package declares MIT. | Separate from npm Lightning CSS. Next Rust/native compiler's complete component/source/notice closure is not assembled; its MIT declaration does not license all its dependencies. Build-only exclusion needs final-artifact verification. |
| Bundled @vercel/og 1.0.1 in Next 16.4.0 | [Actual bundled MPL text](docs/third-party-licenses/next-16.4.0--og-1.0.1--LICENSE), [bundled Satori MPL text](docs/third-party-licenses/next-16.4.0--og-1.0.1--satori--LICENSE); exact published archive [license](docs/third-party-licenses/vercel--og-1.0.1-archive-LICENSE)/[README](docs/third-party-licenses/vercel--og-1.0.1-archive-README.md). | Matching preferred source/build and complete bundled/WASM notices remain unverified; see the focused attempt below. Satori version in the Next bundle is not established. Unused in this shell and absent from inspected traces; full Next installations still contain it. |
| Bundled Geist fonts; font release version unknown, Next 16.4.0 | [Authentic OFL-1.1 with Geist Project Authors' copyright](docs/third-party-licenses/Geist-OFL-1.1.txt), fetched from an immutable upstream commit recorded in the manifest. OG TTF identified by SHA-256 there. | Embedded TTF license was previously corroborated. No claim of matching font-source release/build; other bundled font versions remain unknown. Current production output has no font files. Verify exclusions or accompany each redistributed font with its applicable notice/text. |
| caniuse-lite 1.0.30001815 | [CC-BY-4.0](docs/third-party-licenses/caniuse-lite-1.0.30001815-LICENSE); [upstream attribution guidance](https://github.com/browserslist/caniuse-lite#license); exact npm archive in manifest. **Compatibility data: caniuse.com**, used via caniuse-lite. | Preserve attribution/license/source and identify changes if shared. No dataset identified in current browser output/traces; final/full-install packaging may include it. No local modifications made to the dependency by this task. |
| @humanfs/types 0.15.0; @humanfs/core 0.19.2 | [Packaged author/license README](docs/third-party-licenses/humanfs--types-0.15.0-README.md), [exact-release upstream README](docs/third-party-licenses/humanfs-types-0.15.0-upstream-README.md), [authentic core Apache-2.0 text](docs/third-party-licenses/humanfs--core-0.19.2-LICENSE). [Matching types source](https://github.com/humanwhocodes/humanfs/blob/85069f193cbacc371c3beb649ce746f8c5a493be/packages/types/src/hfs-types.ts); author Nicholas C. Zakas. | Supplemental Apache text and attribution are now available for tooling copies; types tarball still lacks LICENSE. No invented copyright year or claim of all source/NOTICE coverage. Retain applicable original source notices if distributing source. |
| client-only 0.0.1, including Next's copy | Exact npm archive provenance and file hashes in manifest. MIT metadata; no license/copyright file available. | Authentic applicable MIT permission/copyright notice remains missing. Empty runtime entry does not establish a legal exemption; see below. No replacement or safeguard removal authorized. |
| minimatch 10.2.6 | [BlueOak-1.0.0](docs/third-party-licenses/minimatch-10.2.6-LICENSE.md); exact npm source in manifest. | Preserve license text/link if tooling is shared; all associated transitives not inventoried here. |
| Rolldown 1.2.13 | [MIT](docs/third-party-licenses/rolldown-1.2.13-LICENSE), [Rollup/esbuild notices](docs/third-party-licenses/rolldown-1.2.13-THIRD-PARTY-LICENSE); [exact upstream release](https://github.com/rolldown/rolldown/tree/v1.2.13). | Native binding's declaration was previously reconciled with parent/upstream; complete native-input closure remains open if builder binaries are shared. |
| Vite 8.3.4, including bundled Chokidar 3.6.0/braces 3.0.3 | [Aggregate license/notices](docs/third-party-licenses/vite-8.3.4-LICENSE.md); exact Vite archive in manifest. | Keep aggregate notices with redistributed tooling; this is license evidence, not a fix for the separately recorded braces advisory. |
| esrecurse 4.3.0; imurmurhash 0.1.4; natural-compare 1.4.0 | [Verbatim BSD-2-Clause source notice](docs/third-party-licenses/esrecurse-4.3.0-source-license-header.txt), [imurmurhash README/MIT](docs/third-party-licenses/imurmurhash-0.1.4-README.md), [natural-compare author README](docs/third-party-licenses/natural-compare-1.4.0-README.md) and [author's actual MIT text](docs/third-party-licenses/natural-compare-author-MIT.txt). Exact packages/sources/hashes in manifest. | Preserve these embedded notices with shared tooling; no complete lint dependency inventory claimed. |

## Native version and notice mapping

Versions below come from the installed Windows native `versions.json` and agree with the copied sharp-libvips 1.3.4 `versions.properties`. Terms come from that release's authentic notices, not a guess from the wrapper license. The [tagged build repository](https://github.com/lovell/sharp-libvips/tree/v1.3.4), including its [build entry point](https://github.com/lovell/sharp-libvips/blob/v1.3.4/build.sh), is the source/build reference for this map; the complete component source archive/patch closure has not been collected or reproduced.

| Native component | Installed version/revision | Upstream notice terms |
| --- | --- | --- |
| aom | 3.15.1 | BSD-2-Clause + AOM Patent License 1.0 |
| libarchive | 3.8.9 | BSD-2-Clause |
| cairo | 1.18.6 | MPL-1.1 |
| cgif | 0.5.4 | MIT |
| libexif | 0.6.26 | LGPLv3 via later-version clause |
| expat | 2.8.5 | MIT |
| libffi | 3.8.0 | MIT |
| fontconfig | 2.18.3 | Custom BSD-like fontconfig license |
| FreeType | 2.14.3 | FreeType License (FTL) |
| fribidi | 1.0.17 | LGPLv3 via later-version clause |
| glib | 2.90.0 | LGPLv3 via later-version clause |
| harfbuzz | 14.5.0 | MIT |
| libheif | 1.23.5 | LGPLv3 via later-version clause |
| highway | 1.4.0 | BSD-3-Clause |
| libimagequant | 2.4.1 | BSD-2-Clause |
| lcms | 2.19.1 | MIT |
| mozjpeg | 0826579 (upstream short revision) | zlib, IJG, BSD-3-Clause |
| pango | 1.58.2 | LGPLv3 via later-version clause |
| pixman | 0.46.4 | MIT |
| libpng | 1.6.58 | Custom libpng license |
| proxy-libintl | 0.5 | LGPLv3 via later-version clause |
| librsvg | 2.63.2 | LGPLv3 via later-version clause |
| libtiff | 4.7.2 | Custom BSD-like libtiff license |
| libultrahdr | 2.0.2 | MIT |
| libvips | 8.18.7 | LGPLv3 via later-version clause |
| libwebp | 1.6.0 | New BSD |
| libxml2 | 2.15.4 | MIT |
| zlib-ng | 2.3.3 | zlib |

Supplemental authentic texts: [LGPL-3.0](docs/third-party-licenses/LGPL-3.0-or-later.txt) and [GPL-3.0](docs/third-party-licenses/GPL-3.0-or-later.txt) from the pinned SPDX license-list release, [MPL-1.1](docs/third-party-licenses/MPL-1.1.txt) from Mozilla, and [FreeType 2.14.3 FTL](docs/third-party-licenses/FreeType-2.14.3-FTL.TXT) from that release. GNU origin requests failed (403/connectivity); the manifest records that and the actual successful SPDX source, rather than claiming GNU bytes were fetched. The general LGPL/GPL texts do not substitute for each library's copyright notices/source. The [AOM patent terms](https://aomedia.org/license/patent-license/) remain a source reference; an exact applicable bundled copy and remaining library-specific texts/credits still need assembling for any conveyed native artifact.

The native image-processing software is based in part on the work of the **FreeType Team** ([FreeType Project](https://freetype.org)); no endorsement is implied. This supplies the FTL documentation credit without inventing a copyright year. Source-file notices, changes and the final artifact's accompanying documentation still require verification.

## Single focused provenance attempt

On 2026-10-09, inspected the two exact official npm registry release records and published archives, without installation or package execution. SHA-512 matched each release's registry `dist.integrity`; archive SHA-256, full member lists and selected file/source hashes are retained in the manifest. This was one new lead (published archives), not a repeated repository search. No publisher was contacted.

| Component | What the authoritative archive establishes | Precise remaining evidence and release consequence |
| --- | --- | --- |
| client-only 0.0.1 | [Release record](https://registry.npmjs.org/client-only/0.0.1) and [archive](https://registry.npmjs.org/client-only/-/client-only-0.0.1.tgz) contain only `index.js`, `error.js`, `package.json`: no README/LICENSE/NOTICE, repository or gitHead. Empty index and error file exactly match the installed release. Earlier Next copy-recipe/file comparison confirms the copy chain. | Need an authentic applicable MIT copyright/permission notice from the publisher, or a documented qualified determination for the exact conveyed files. Current traces list empty entry + metadata; full installs include the error code. Before conveying an artifact containing it, resolve this question for that scope. Do not invent a React/Meta notice, apply Next's MIT notice as a cure, or remove the boundary safeguard. This does not establish a prohibition on isolated local database work. |
| @vercel/og 1.0.1 bundled by Next 16.4.0 | [Release record](https://registry.npmjs.org/%40vercel%2Fog/1.0.1)/[archive](https://registry.npmjs.org/@vercel/og/-/og-1.0.1.tgz) supply MPL text, README, and two source maps with 201/201 embedded sources each, including package TypeScript and JS dependency inputs. These are **partial authentic source evidence**. Source paths identify archive Satori 0.29.0, patched yoga-layout 3.2.1 and resvg-wasm 2.4.1; they do not establish the Next bundle's full version/source mapping. Both WASM files and Geist TTF exactly match Next's copy. Both JS bundle hashes differ, including after CRLF normalization; difference is not just a source-map trailer. | Need matching preferred source and build/patch mapping for **Next's actual JS bundle**, and exact native source/build/patches and applicable notices for the matching WASM files and other bundled inputs. Source maps contain wrappers/base64 WASM, not verified native C++/Rust sources. Registry's `vercel/og` commit `6c0c54f328a745f9cf4f4faa66566e93b51a1079` remains the earlier unavailable source reference (404); this attempt did not repeat that search. Do not advertise archive maps as corresponding source for Next's differing bundle. If a release conveys OG/WASM, resolve these gaps; otherwise verify supported exclusion of the unused files in the actual release artifact. |

The archive README's historical Noto Sans statement is not evidence of this bundle's font identity: the matching file is Geist-Regular.ttf. Upstream illustrative logos/images/links in copied READMEs are reference material, not application assets or permission to incorporate those images into the product.

## Explicit release requirements

1. Obtain the outstanding owner decision on MPL/LGPL obligations under AGENTS.md; notices alone do not accept them. Resolve the two provenance questions for artifacts that convey the affected files. No unresolved finding is cleared here.
2. Check the final website's actual target OS/architecture, server/container and any transferred builder contents, browser chunks/data/fonts, and distribution relationships. Inventory remaining packages and embedded/native components; preserve their authentic licenses, applicable NOTICE/attribution, change notices and source access. No full closure of all lockfile entries, Next compiled components, browser bundles, optional binaries or build inputs is claimed.
3. Implement and verify supported exclusions and explicit notice copying when packaging is selected. Current tracing omits relevant Sharp notice files; this documentation task changes no packaging and supplies no release-ready source/relinking kit. Verify LGPL replacement/relinking and any applicable installation information using the actual artifact and recipient terms.
4. Review only components actually packaged in the future mobile client after framework/distribution selection, plus transferred backend artifacts separately. Server/tooling dependencies are not automatically mobile dependencies. Fonts, icons, templates and copied code need their own verified provenance.
5. Keep security reassessment separate: the README's unresolved braces advisory remains configuration-mitigated, not fixed. Refresh remains owner-confirmed recovered/resolved, with no proven root-cause code fix. Neither is cleared by this notice collection.

No new application assets, dependencies, packaging or project license were introduced. Owner-supplied academic documents' redistribution permission remains unverified; the private-repository intent does not establish university endorsement or authorization to publish them.
