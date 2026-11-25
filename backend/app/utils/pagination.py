import math


def page_count(total: int, page_size: int) -> int:
    return max(1, math.ceil(total / page_size)) if total else 0


def offset_for(page: int, page_size: int) -> int:
    return (page - 1) * page_size
