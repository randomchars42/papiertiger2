.PHONY: serve transpile

serve:
	python3 -m http.server

transpile:
	tsc -p ./app/ts/ -w

tag_release_patch:
	./tag_release.sh patch

tag_release_minor:
	./tag_release.sh minor

tag_release_major:
	./tag_release.sh major

tag_date:
	#git describe --tags | awk -v date="$(date +%Y%m%d%H%M%s)" '{split($0,a,"-"); print "export const VERSION: string = \"" a[1] "-" date "\";"}'
	git describe --tags | awk -v date="$$(date +%Y%m%d%H%M%s)" '{split($$0,a,"-"); print a[1] "-" date}'
