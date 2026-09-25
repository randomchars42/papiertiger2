.PHONY: serve compile build transpile check test

serve:
	python3 -m http.server --directory app

compile:
	python3 ./scripts/compile_textblocks.py

build: compile
	find ./app/js -type f -name '*.js' -delete
	tsc -p ./app/ts/

transpile:
	tsc -p ./app/ts/ -w

check:
	python3 ./scripts/compile_textblocks.py --check
	tsc -p ./app/ts/ --noEmit

test: build
	python3 -m unittest discover -s tests -p 'test_*.py'
	node --test tests/*.test.js

tag_release_patch:
	./tag_release.sh patch

tag_release_minor:
	./tag_release.sh minor

tag_release_major:
	./tag_release.sh major

tag_date:
	#git describe --tags | awk -v date="$(date +%Y%m%d%H%M%s)" '{split($0,a,"-"); print "export const VERSION: string = \"" a[1] "-" date "\";"}'
	git describe --tags | awk -v date="$$(date +%Y%m%d%H%M%s)" '{split($$0,a,"-"); print a[1] "-" date}'
