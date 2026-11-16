"""Package the current extension without browser-generated metadata."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
target = root / 'dist' / 'langlock.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        relative = path.relative_to(source)
        if path.is_file() and '_metadata' not in relative.parts and path.name != '.DS_Store':
            archive.write(path, relative)
print(target)
