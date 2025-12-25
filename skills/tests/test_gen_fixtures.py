"""
Unit tests for the gen-fixtures skill.

Tests:
- Python file parsing
- Factory function generation
- Sample data generation
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Add skills directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "development"))

from importlib import import_module

# Import the module
gen_fixtures = import_module("gen-fixtures")


class TestParsePythonFile:
    """Tests for Python file parsing."""

    def test_parses_simple_class(self, tmp_path: Path) -> None:
        """Test parsing a simple class."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str
    email: str
    age: int
''')
        classes, functions = gen_fixtures.parse_python_file(source_file)

        assert len(classes) == 1
        assert classes[0].name == "User"
        assert len(classes[0].fields) == 3

    def test_parses_class_with_init(self, tmp_path: Path) -> None:
        """Test parsing class with __init__ method."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    def __init__(self, name: str, email: str, active: bool = True):
        self.name = name
        self.email = email
        self.active = active
''')
        classes, functions = gen_fixtures.parse_python_file(source_file)

        assert len(classes) == 1
        assert len(classes[0].init_params) == 3
        assert classes[0].init_params[0] == ("name", "str", None)

    def test_parses_multiple_classes(self, tmp_path: Path) -> None:
        """Test parsing multiple classes."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str

class Post:
    title: str
    content: str
''')
        classes, functions = gen_fixtures.parse_python_file(source_file)

        assert len(classes) == 2
        assert classes[0].name == "User"
        assert classes[1].name == "Post"

    def test_parses_functions(self, tmp_path: Path) -> None:
        """Test parsing standalone functions."""
        source_file = tmp_path / "utils.py"
        source_file.write_text('''
def greet(name: str) -> str:
    return f"Hello, {name}!"

def add(a: int, b: int) -> int:
    return a + b
''')
        classes, functions = gen_fixtures.parse_python_file(source_file)

        assert len(functions) >= 2

    def test_handles_invalid_file(self, tmp_path: Path) -> None:
        """Test handling of invalid Python file."""
        source_file = tmp_path / "invalid.py"
        source_file.write_text("this is not valid python @#$%")

        classes, functions = gen_fixtures.parse_python_file(source_file)

        # Should return empty lists, not raise
        assert classes == []
        assert functions == []


class TestGenerateSampleValue:
    """Tests for sample value generation."""

    def test_generates_str(self) -> None:
        """Test string sample value."""
        value = gen_fixtures.generate_sample_value("str")
        assert isinstance(value, str)

    def test_generates_int(self) -> None:
        """Test int sample value."""
        value = gen_fixtures.generate_sample_value("int")
        assert isinstance(value, int)

    def test_generates_float(self) -> None:
        """Test float sample value."""
        value = gen_fixtures.generate_sample_value("float")
        assert isinstance(value, float)

    def test_generates_bool(self) -> None:
        """Test bool sample value."""
        value = gen_fixtures.generate_sample_value("bool")
        assert isinstance(value, bool)

    def test_generates_list(self) -> None:
        """Test list sample value."""
        value = gen_fixtures.generate_sample_value("list[str]")
        assert isinstance(value, list)

    def test_generates_dict(self) -> None:
        """Test dict sample value."""
        value = gen_fixtures.generate_sample_value("dict[str, int]")
        assert isinstance(value, dict)

    def test_generates_optional_as_none(self) -> None:
        """Test Optional type returns None."""
        value = gen_fixtures.generate_sample_value("Optional[str]")
        assert value is None

    def test_generates_datetime_iso_format(self) -> None:
        """Test datetime returns ISO format string."""
        value = gen_fixtures.generate_sample_value("datetime")
        assert "T" in value  # ISO format

    def test_generates_uuid(self) -> None:
        """Test UUID generation."""
        value = gen_fixtures.generate_sample_value("UUID")
        assert "-" in value  # UUID format

    def test_generates_path(self) -> None:
        """Test Path generation."""
        value = gen_fixtures.generate_sample_value("Path")
        assert value.startswith("/")

    def test_handles_unknown_type(self) -> None:
        """Test unknown type returns placeholder."""
        value = gen_fixtures.generate_sample_value("CustomType")
        assert "sample" in str(value).lower() or "custom" in str(value).lower()


class TestGenerateFactoryFunction:
    """Tests for factory function generation."""

    def test_generates_factory_for_simple_class(self) -> None:
        """Test factory generation for simple class."""
        class_info = gen_fixtures.ClassInfo(
            name="User",
            fields=[("name", "str"), ("age", "int")],
            init_params=[],
        )

        factory = gen_fixtures.generate_factory_function(class_info)

        assert "def user_factory" in factory
        assert "-> User:" in factory
        assert "return User(" in factory

    def test_includes_type_hints(self) -> None:
        """Test that factory includes type hints."""
        class_info = gen_fixtures.ClassInfo(
            name="User",
            fields=[("name", "str"), ("email", "str")],
            init_params=[],
        )

        factory = gen_fixtures.generate_factory_function(class_info)

        assert ": str" in factory

    def test_generates_default_values(self) -> None:
        """Test that factory has default values."""
        class_info = gen_fixtures.ClassInfo(
            name="User",
            fields=[("name", "str"), ("count", "int")],
            init_params=[],
        )

        factory = gen_fixtures.generate_factory_function(class_info)

        # Should have string default
        assert '= "' in factory or "= '" in factory

    def test_uses_init_params_when_available(self) -> None:
        """Test that __init__ params are preferred over fields."""
        class_info = gen_fixtures.ClassInfo(
            name="User",
            fields=[("x", "str")],  # Field
            init_params=[("name", "str", None), ("age", "int", None)],
        )

        factory = gen_fixtures.generate_factory_function(class_info)

        # Should use init params, not fields
        assert "name" in factory
        assert "age" in factory


class TestGenerateSampleData:
    """Tests for sample data generation."""

    def test_generates_data_dict(self) -> None:
        """Test sample data generation."""
        class_info = gen_fixtures.ClassInfo(
            name="User",
            fields=[("name", "str"), ("age", "int")],
            init_params=[],
        )

        data = gen_fixtures.generate_sample_data(class_info)

        assert "name" in data
        assert "age" in data
        assert isinstance(data["name"], str)
        assert isinstance(data["age"], int)


class TestExecuteFunction:
    """Tests for the main execute function."""

    def test_generates_fixtures_for_file(self, tmp_path: Path) -> None:
        """Test fixture generation for a file."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str
    email: str
''')

        result = gen_fixtures.execute(
            source_file="models.py",
            repo_path=str(tmp_path),
            fixture_type="all",
        )

        assert result["success"] is True
        assert len(result["fixtures_created"]) > 0
        assert "User" in result["classes_analyzed"]

    def test_generates_factory_only(self, tmp_path: Path) -> None:
        """Test generating only factory fixtures."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str
''')

        result = gen_fixtures.execute(
            source_file="models.py",
            repo_path=str(tmp_path),
            fixture_type="factory",
        )

        assert result["success"] is True
        fixtures = result["fixtures_created"]
        assert all(f["type"] == "factory" for f in fixtures)

    def test_generates_sample_data_only(self, tmp_path: Path) -> None:
        """Test generating only sample data."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str
''')

        result = gen_fixtures.execute(
            source_file="models.py",
            repo_path=str(tmp_path),
            fixture_type="sample_data",
        )

        assert result["success"] is True
        assert "user" in result["sample_data"]

    def test_handles_nonexistent_file(self, tmp_path: Path) -> None:
        """Test handling of nonexistent file."""
        result = gen_fixtures.execute(
            source_file="nonexistent.py",
            repo_path=str(tmp_path),
        )

        assert result["success"] is False
        assert "error" in result

    def test_handles_file_with_no_classes(self, tmp_path: Path) -> None:
        """Test handling of file with no classes."""
        source_file = tmp_path / "utils.py"
        source_file.write_text('''
def helper():
    pass
''')

        result = gen_fixtures.execute(
            source_file="utils.py",
            repo_path=str(tmp_path),
        )

        assert result["success"] is True
        assert result["fixtures_created"] == []

    def test_writes_fixture_file(self, tmp_path: Path) -> None:
        """Test writing fixture file to output directory."""
        source_file = tmp_path / "models.py"
        source_file.write_text('''
class User:
    name: str
''')
        output_dir = tmp_path / "fixtures"

        result = gen_fixtures.execute(
            source_file="models.py",
            repo_path=str(tmp_path),
            output_dir=str(output_dir),
        )

        assert result["success"] is True
        # Check that fixture file was created
        fixture_file = output_dir / "fixtures_models.py"
        assert fixture_file.exists()
        content = fixture_file.read_text()
        assert "def user_factory" in content
