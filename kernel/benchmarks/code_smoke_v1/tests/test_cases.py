from __future__ import annotations

import pytest
from benches.code_smoke_v1 import tasks


def test_case_01_add_ints() -> None:
    assert tasks.add_ints(2, 3) == 5
    assert tasks.add_ints(-1, 1) == 0


def test_case_02_clamp_int() -> None:
    assert tasks.clamp_int(5, 0, 10) == 5
    assert tasks.clamp_int(-5, 0, 10) == 0
    assert tasks.clamp_int(50, 0, 10) == 10
    with pytest.raises(ValueError):
        tasks.clamp_int(1, 10, 0)


def test_case_03_normalize_whitespace() -> None:
    assert tasks.normalize_whitespace("  hello   world ") == "hello world"
    assert tasks.normalize_whitespace("a\tb\nc") == "a b c"


def test_case_04_slugify() -> None:
    assert tasks.slugify("Hello, World!") == "hello-world"
    assert tasks.slugify("  Multiple---separators  ") == "multiple-separators"
    assert tasks.slugify("___") == ""


def test_case_05_parse_kv_pairs() -> None:
    assert tasks.parse_kv_pairs("a=1,b=two") == {"a": "1", "b": "two"}
    assert tasks.parse_kv_pairs(" a = 1 , , b = two ") == {"a": "1", "b": "two"}
    with pytest.raises(ValueError):
        tasks.parse_kv_pairs("a=1,b")


def test_case_06_safe_divide() -> None:
    assert tasks.safe_divide(10, 2) == 5
    assert tasks.safe_divide(10, 0) is None


def test_case_07_chunk_list() -> None:
    assert tasks.chunk_list([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]
    assert tasks.chunk_list([], 3) == []
    with pytest.raises(ValueError):
        tasks.chunk_list([1], 0)


def test_case_08_unique_preserve_order() -> None:
    assert tasks.unique_preserve_order(["a", "b", "a", "c", "b"]) == ["a", "b", "c"]
    assert tasks.unique_preserve_order([]) == []


def test_case_09_is_valid_email_basic() -> None:
    assert tasks.is_valid_email_basic("a@b.co") is True
    assert tasks.is_valid_email_basic("a@b") is False
    assert tasks.is_valid_email_basic("@b.co") is False
    assert tasks.is_valid_email_basic("a@.co") is False
    assert tasks.is_valid_email_basic("a@@b.co") is False


def test_case_10_format_bytes() -> None:
    assert tasks.format_bytes(0) == "0 B"
    assert tasks.format_bytes(999) == "999 B"
    assert tasks.format_bytes(1024) == "1 KiB"
    assert tasks.format_bytes(1536) == "1.5 KiB"
    assert tasks.format_bytes(1024 * 1024) == "1 MiB"


def test_case_11_parse_csv_line() -> None:
    assert tasks.parse_csv_line("a,b,c") == ["a", "b", "c"]
    assert tasks.parse_csv_line('"a,b",c') == ["a,b", "c"]
    assert tasks.parse_csv_line('"a""b",c') == ['a"b', "c"]


def test_case_12_median_ints() -> None:
    assert tasks.median_ints([3, 1, 2]) == 2
    assert tasks.median_ints([4, 1, 3, 2]) == 2.5
    with pytest.raises(ValueError):
        tasks.median_ints([])


def test_case_13_rolling_sum() -> None:
    assert tasks.rolling_sum([1, 2, 3]) == [1, 3, 6]
    assert tasks.rolling_sum([]) == []


def test_case_14_coalesce() -> None:
    assert tasks.coalesce(None, None, "x", "y") == "x"
    assert tasks.coalesce(None, None) is None


def test_case_15_invert_dict_unique() -> None:
    assert tasks.invert_dict_unique({"a": "1", "b": "2"}) == {"1": "a", "2": "b"}
    with pytest.raises(ValueError):
        tasks.invert_dict_unique({"a": "1", "b": "1"})


def test_case_16_json_pointer_get() -> None:
    obj = {"a": {"b": [10, 20]}}
    assert tasks.json_pointer_get(obj, "/a/b/1") == 20
    assert tasks.json_pointer_get(obj, "") == obj
    with pytest.raises(KeyError):
        tasks.json_pointer_get(obj, "/a/b/2")


def test_case_17_stable_sort_by_key() -> None:
    items = [{"k": 2, "id": 1}, {"k": 1, "id": 2}, {"k": 2, "id": 3}]
    out = tasks.stable_sort_by_key(items, "k")
    assert [i["id"] for i in out] == [2, 1, 3]
    with pytest.raises(KeyError):
        tasks.stable_sort_by_key([{"x": 1}], "k")


def test_case_18_parse_duration_seconds() -> None:
    assert tasks.parse_duration_seconds("10s") == 10
    assert tasks.parse_duration_seconds("5m") == 300
    assert tasks.parse_duration_seconds("2h") == 7200
    with pytest.raises(ValueError):
        tasks.parse_duration_seconds("10")


def test_case_19_redact_secrets() -> None:
    assert tasks.redact_secrets("token=ABC; id=1", ["ABC"]) == "token=***; id=1"
    assert tasks.redact_secrets("nothing", [""]) == "nothing"


def test_case_20_longest_common_prefix() -> None:
    assert tasks.longest_common_prefix(["flower", "flow", "flight"]) == "fl"
    assert tasks.longest_common_prefix([]) == ""
    assert tasks.longest_common_prefix(["solo"]) == "solo"
