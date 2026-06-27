import assert from "node:assert/strict";
import { IMAGE_SIZE_PRESETS, IMAGE_RESOLUTION_OPTIONS, resolveImageSizePreset, resolveImageSizeValue, describeImageSizeValue } from "../src/lib/image-size-presets.ts";

assert.equal(IMAGE_SIZE_PRESETS.length, 10, "应包含 10 个常用尺寸比例");
assert.deepEqual(
    IMAGE_RESOLUTION_OPTIONS.map((item) => item.value),
    ["1K", "2K", "4K"],
);

const cases = [
    ["square", "1K", "1024x1024", "1:1 Square · 1K"],
    ["square", "4K", "2880x2880", "1:1 Square · 4K"],
    ["widescreen", "4K", "3840x2160", "16:9 Widescreen · 4K"],
    ["story", "4K", "2160x3840", "9:16 Story · 4K"],
    ["print", "4K", "3200x2560", "5:4 Print · 4K"],
    ["feed", "4K", "2560x3200", "4:5 Feed · 4K"],
    ["classic", "4K", "3264x2448", "4:3 Classic · 4K"],
    ["vertical", "4K", "2448x3264", "3:4 Vertical · 4K"],
    ["photo", "4K", "3504x2336", "3:2 Photo · 4K"],
    ["portrait", "4K", "2336x3504", "2:3 Portrait · 4K"],
    ["exclusive", "4K", "3808x1632", "21:9 Exclusive · 4K"],
];

for (const [presetId, resolution, expectedSize, expectedLabel] of cases) {
    assert.equal(resolveImageSizeValue(presetId, resolution), expectedSize, `${presetId} ${resolution} 尺寸错误`);
    assert.equal(describeImageSizeValue(expectedSize), expectedLabel, `${expectedSize} 描述错误`);
}

assert.deepEqual(resolveImageSizePreset("2160x3840"), {
    presetId: "story",
    resolution: "4K",
    size: "2160x3840",
});
assert.equal(resolveImageSizePreset("4096x4096"), null);
assert.equal(resolveImageSizeValue("missing", "4K"), undefined);
assert.equal(describeImageSizeValue("1234x567"), "1234×567");

console.log("image-size-presets ok");
