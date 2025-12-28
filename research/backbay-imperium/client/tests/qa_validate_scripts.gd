extends Node

## Headless validation for scripts/scenes.
## Loads all .gd and .tscn files under res://scripts, res://scenes, res://tests.

const VALIDATE_DIRS: Array[String] = [
	"res://scripts",
	"res://scenes",
	"res://tests",
]

const VALIDATE_EXTS: Array[String] = ["gd", "tscn"]


func _ready() -> void:
	var files: Array[String] = []
	for dir_path in VALIDATE_DIRS:
		_collect_files(dir_path, files)

	var failures: Array[String] = []
	for path in files:
		var res = ResourceLoader.load(path)
		if res == null:
			failures.append(path)
			continue
		if res is Script:
			var script := res as Script
			if not script.can_instantiate():
				failures.append(path)
				continue
		if res is PackedScene:
			var scene := res as PackedScene
			if not scene.can_instantiate():
				failures.append(path)
				continue

	print("\n=== QA Validate Scripts/Scenes ===")
	print("Checked %d files" % files.size())
	if failures.is_empty():
		print("[PASS] All resources loaded")
		get_tree().quit(0)
	else:
		for path in failures:
			print("[FAIL] Failed to load: %s" % path)
		print("[FAIL] %d resources failed to load" % failures.size())
		get_tree().quit(1)


func _collect_files(dir_path: String, out: Array[String]) -> void:
	var dir = DirAccess.open(dir_path)
	if dir == null:
		return

	dir.list_dir_begin()
	while true:
		var name = dir.get_next()
		if name == "":
			break
		if name.begins_with("."):
			continue

		var full_path = dir_path.path_join(name)
		if dir.current_is_dir():
			_collect_files(full_path, out)
			continue

		var ext = name.get_extension().to_lower()
		if VALIDATE_EXTS.has(ext):
			out.append(full_path)
	dir.list_dir_end()
