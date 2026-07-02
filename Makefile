zip:
	@npm run build:prod
	@rm -f wa-sync-extension.zip
	@cd dist && zip -r ../wa-sync-extension.zip .
