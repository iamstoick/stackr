FROM nginx:1-alpine

# Replaces the default site config entirely.
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
