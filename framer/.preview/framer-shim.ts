export const ControlType = {
    Color: "color",
    Number: "number",
    Boolean: "boolean",
    String: "string",
    Enum: "enum",
    Link: "link",
    Object: "object",
    Image: "image",
    File: "file",
}

export const RenderTarget = {
    canvas: "CANVAS",
    preview: "PREVIEW",
    export: "EXPORT",
    thumbnail: "THUMBNAIL",
    current: () => "PREVIEW",
}

export function addPropertyControls() {}
