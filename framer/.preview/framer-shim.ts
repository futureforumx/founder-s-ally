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
    Slot: "slot",
    Array: "array",
}

export const RenderTarget = {
    canvas: "CANVAS",
    preview: "PREVIEW",
    export: "EXPORT",
    thumbnail: "THUMBNAIL",
    current: () => "PREVIEW",
}

export function addPropertyControls() {}

export function useIsOnFramerCanvas() {
    return false
}

export const defaultEvents = {}

export { motion } from "framer-motion"
