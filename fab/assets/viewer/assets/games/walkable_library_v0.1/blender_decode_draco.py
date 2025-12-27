import sys
import bpy

argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []
if len(argv) != 2:
    raise SystemExit("Expected: <source_glb> <dest_glb>")
source_glb, dest_glb = argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source_glb)
bpy.ops.export_scene.gltf(
    filepath=dest_glb,
    export_format="GLB",
    export_draco_mesh_compression_enable=False,
)
