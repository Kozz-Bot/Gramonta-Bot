#!/usr/bin/env sh

openssl genrsa -out ../keys/privatekey.pem 2048
openssl rsa -in ../keys/privatekey.pem -out ../keys/publickey.pem -pubout -outform PEM